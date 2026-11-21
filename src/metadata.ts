import type { ParseWarningHandler } from "./types.ts";

/**
 * A `key:value` extension: the first colon separates a non-empty, colon-free
 * key from a value that may be empty and may contain further colons.
 */
const EXTENSION_PATTERN = /^([^:\s]+):(\S*)$/;

/** Metadata collected from a task's text. */
export interface TodoMetadata {
  projects: string[];
  contexts: string[];
  data: Record<string, string>;
}

/** Everything derived from a task's text in one token pass. */
export interface TodoText extends TodoMetadata {
  description: string;
}

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
 * `key:value` extension. Bare `+`/`@` tokens and empty keys are not
 * metadata.
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

/**
 * Collect a task's description, projects, contexts, and extensions in one pass.
 *
 * Previous versions tokenized the text once for metadata and again to strip it;
 * doing both here keeps parsing to a single split per line.
 *
 * When a `key:value` key is repeated, `onWarning` receives a
 * `duplicate-metadata-key` warning and the last value wins.
 */
export function parseText(
  text: string,
  onWarning?: ParseWarningHandler,
): TodoText {
  const projects: string[] = [];
  const contexts: string[] = [];
  const data: Record<string, string> = {};
  const descriptionTokens: string[] = [];

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
      if (Object.hasOwn(data, key)) {
        onWarning?.({
          code: "duplicate-metadata-key",
          message: `Duplicate metadata key "${key}"; the last value wins.`,
          meta: { key, previousValue: data[key], value },
        });
      }

      data[key] = value;
      continue;
    }

    descriptionTokens.push(token);
  }

  return {
    description: descriptionTokens.join(" "),
    projects,
    contexts,
    data,
  };
}

/** Collect projects, contexts, and extensions from task text. */
export function parseMetadata(text: string): TodoMetadata {
  const { projects, contexts, data } = parseText(text);
  return { projects, contexts, data };
}

/**
 * Remove inline metadata from task text.
 *
 * Remaining tokens are rejoined with single spaces, so repeated whitespace can
 * be normalized.
 */
export function stripMetadata(text: string): string {
  return parseText(text).description;
}
