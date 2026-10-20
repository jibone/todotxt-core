import type { TodoItem } from "./types.ts";

const EXTENSION_PATTERN = /^([^:\s]+):([^:\s]+)$/;

function tokenize(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") {
    return [];
  }

  return trimmed.split(/\s+/);
}

/**
 * True when a whitespace-delimited token is inline metadata.
 *
 * Inline metadata is a project (`+name`), a context (`@name`), or a
 * `key:value` extension. Bare `+`/`@` tokens and values containing another
 * colon are not metadata.
 */
export function isMetadataToken(token: string): boolean {
  if (token.startsWith("+") && token.length > 1) {
    return true;
  }

  if (token.startsWith("@") && token.length > 1) {
    return true;
  }

  return EXTENSION_PATTERN.test(token);
}

/** Collect projects, contexts, and extensions from task text. */
export function parseMetadata(text: string): Pick<
  TodoItem,
  "projects" | "contexts" | "extensions"
> {
  const projects: string[] = [];
  const contexts: string[] = [];
  const extensions: Record<string, string> = {};

  for (const token of tokenize(text)) {
    if (token.startsWith("+") && token.length > 1) {
      projects.push(token.slice(1));
      continue;
    }

    if (token.startsWith("@") && token.length > 1) {
      contexts.push(token.slice(1));
      continue;
    }

    const extension = EXTENSION_PATTERN.exec(token);
    const key = extension?.[1];
    const value = extension?.[2];
    if (key !== undefined && value !== undefined) {
      extensions[key] = value;
    }
  }

  return { projects, contexts, extensions };
}

/**
 * Remove inline metadata from task text.
 *
 * Remaining tokens are rejoined with single spaces, so repeated whitespace can
 * be normalized.
 */
export function stripMetadata(text: string): string {
  return tokenize(text)
    .filter((token) => !isMetadataToken(token))
    .join(" ");
}
