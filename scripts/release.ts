#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_BRANCH = "master";
const BUMP_KINDS = ["current", "patch", "minor", "major"] as const;
const USAGE = "Usage: bun run release <current|patch|minor|major> [--dry-run]";

type Bump = (typeof BUMP_KINDS)[number];

interface PackageJson {
  name: string;
  version: string;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const bumpArg = argv.find((arg) => !arg.startsWith("-"));

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

if (!isBump(bumpArg)) {
  console.error(USAGE);
  process.exit(1);
}

const bump = bumpArg;

function isBump(value: string | undefined): value is Bump {
  return value !== undefined && (BUMP_KINDS as readonly string[]).includes(value);
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function label(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });

  if (result.error) {
    fail(`Could not run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`Command failed: ${label(command, args)}\n${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

function succeeds(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "ignore" });
  return result.error === undefined && result.status === 0;
}

function run(command: string, args: string[]): void {
  console.log(`\n$ ${label(command, args)}`);

  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });

  if (result.error) {
    fail(`Could not run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`Command failed (exit ${result.status}): ${label(command, args)}`);
  }
}

function readPackage(): PackageJson {
  const contents = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  return JSON.parse(contents) as PackageJson;
}

function nextVersion(version: string, kind: Exclude<Bump, "current">): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    fail(`Unsupported version "${version}"; expected major.minor.patch.`);
  }

  let major = Number(match[1]!);
  let minor = Number(match[2]!);
  let patch = Number(match[3]!);

  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function versionExistsOnNpm(name: string, version: string): boolean {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.error) {
    fail(`Could not run npm view: ${result.error.message}`);
  }

  if (result.status === 0) {
    return true;
  }

  const stderr = result.stderr ?? "";

  if (/E404|404 Not Found/.test(stderr)) {
    return false;
  }

  fail(
    `Could not check whether ${name}@${version} is published:\n${stderr.trim()}`,
  );
}

function tagExists(tag: string): boolean {
  return succeeds("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
}

async function main(): Promise<void> {
  const pkg = readPackage();
  const targetVersion =
    bump === "current" ? pkg.version : nextVersion(pkg.version, bump);
  const tag = `v${targetVersion}`;

  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== RELEASE_BRANCH) {
    if (dryRun) {
      console.warn(`⚠ On branch "${branch}", not "${RELEASE_BRANCH}".`);
    } else {
      fail(`Releases must run from "${RELEASE_BRANCH}", not "${branch}".`);
    }
  }

  const dirty = capture("git", ["status", "--porcelain"]);
  if (dirty !== "") {
    if (dryRun) {
      console.warn("⚠ Working tree is not clean.");
    } else {
      fail("Working tree is not clean. Commit or stash your changes first.");
    }
  }

  if (!dryRun) {
    capture("git", ["fetch", "origin", RELEASE_BRANCH]);

    const head = capture("git", ["rev-parse", "HEAD"]);
    const remote = capture("git", ["rev-parse", `origin/${RELEASE_BRANCH}`]);

    if (head !== remote) {
      fail(`Local ${RELEASE_BRANCH} is not in sync with origin/${RELEASE_BRANCH}.`);
    }
  }

  if (!succeeds("npm", ["whoami"])) {
    if (dryRun) {
      console.warn("⚠ Not logged in to npm (npm whoami failed).");
    } else {
      fail("Not logged in to npm. Run `npm login` first.");
    }
  }

  if (!succeeds("gh", ["auth", "status"])) {
    if (dryRun) {
      console.warn("⚠ GitHub CLI is not authenticated.");
    } else {
      fail("GitHub CLI is not authenticated. Run `gh auth login` first.");
    }
  }

  if (versionExistsOnNpm(pkg.name, targetVersion)) {
    fail(`${pkg.name}@${targetVersion} is already published to npm.`);
  }

  if (tagExists(tag)) {
    fail(`Git tag ${tag} already exists.`);
  }

  console.log(`\nRelease plan for ${pkg.name}@${targetVersion}`);
  console.log(`  current version: ${pkg.version}`);
  console.log(`  release bump:    ${bump}`);
  console.log(`  branch:          ${branch}`);
  console.log("\nChecks:");
  console.log("  bun test");
  console.log("  bunx tsc");
  console.log("  bun run build");
  console.log("  bunx publint");
  console.log("  bunx @arethetypeswrong/cli --pack . --profile esm-only");
  console.log("\nSteps:");

  if (bump !== "current") {
    console.log(`  npm version ${bump} --no-git-tag-version`);
    console.log("  git add package.json bun.lock");
    console.log(`  git commit -m "chore: release v${targetVersion}"`);
    console.log(`  git push origin ${RELEASE_BRANCH}`);
  }

  console.log("  npm publish");
  console.log(`  git tag -a ${tag} -m ${tag}`);
  console.log(`  git push origin ${tag}`);
  console.log(`  gh release create ${tag} --title ${tag} --generate-notes`);

  if (dryRun) {
    console.log("\nDry run: no changes made.\n");
    return;
  }

  console.log("\nRunning release checks...");
  run("bun", ["test"]);
  run("bunx", ["tsc"]);
  run("bun", ["run", "build"]);
  run("bunx", ["publint"]);
  run("bunx", ["@arethetypeswrong/cli", "--pack", ".", "--profile", "esm-only"]);

  if (bump !== "current") {
    run("npm", ["version", bump, "--no-git-tag-version"]);

    const updated = readPackage();
    if (updated.version !== targetVersion) {
      fail(
        `Expected package.json version ${targetVersion}, found ${updated.version}.`,
      );
    }
  }

  const readline = createInterface({ input: stdin, output: stdout });
  let answer = "";

  try {
    answer = await readline.question(
      `\nPublish ${pkg.name}@${targetVersion} to npm? (y/N) `,
    );
  } finally {
    readline.close();
  }

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("Release cancelled.");
    return;
  }

  if (bump !== "current") {
    run("git", ["add", "package.json", "bun.lock"]);
    run("git", ["commit", "-m", `chore: release v${targetVersion}`]);
    run("git", ["push", "origin", RELEASE_BRANCH]);
  }

  run("npm", ["publish"]);
  run("git", ["tag", "-a", tag, "-m", tag]);
  run("git", ["push", "origin", tag]);
  run("gh", ["release", "create", tag, "--title", tag, "--generate-notes"]);

  console.log(`\n✔ Published ${pkg.name}@${targetVersion}\n`);
}

await main();
