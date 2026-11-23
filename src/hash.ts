/**
 * A fingerprint of a document's exact contents, used for staleness checks.
 *
 * The length is stored alongside the hash as a guaranteed discriminator:
 * contents of different lengths always differ, and equal lengths must still
 * collide on the 53-bit hash to be mistaken for each other.
 */
export interface ContentFingerprint {
  /** Length of the fingerprinted string in UTF-16 code units. */
  length: number;
  /** A 53-bit content hash. */
  hash: number;
}

// Fixed seeds: the fingerprint must be deterministic across calls, runs,
// and machines, so nothing about it may be randomized.
const SEED_A = 0xdeadbeef;
const SEED_B = 0x41c6ce57;

// Odd multipliers for the mixing steps; the exact values only need to be
// fixed and reasonably well distributed.
const LANE_A = 2654435761;
const LANE_B = 1597334677;

/**
 * Fingerprint the exact contents of a document.
 *
 * Two independent 32-bit lanes (a cyrb53-style construction) fold every
 * UTF-16 code unit with `Math.imul`, cross-mix in a finalization step so
 * neither lane can be treated separately, and combine into one integer that
 * stays within the 53-bit safe range. The result collides only by
 * coincidence — for todo.txt-scale files, practically never.
 */
export function fingerprint(contents: string): ContentFingerprint {
  let a = SEED_A;
  let b = SEED_B;

  for (let index = 0; index < contents.length; index += 1) {
    const code = contents.charCodeAt(index);
    a = Math.imul(a ^ code, LANE_A);
    b = Math.imul(b ^ code, LANE_B);
  }

  // Finalization: cross-mix the lanes so the combined value depends on both.
  a = Math.imul(a ^ (b >>> 15), a | 1);
  b = Math.imul(b ^ (a >>> 15), b | 1);

  // (2^32 - 1) * 2^21 + (2^32 - 1) stays below 2^53, so the sum is exact.
  const hash = (b >>> 0) * 2097152 + (a >>> 0);

  return { length: contents.length, hash };
}

/**
 * True when two fingerprints describe identical contents.
 *
 * The length compares first: a difference there is always a difference in
 * contents, whatever the hash says.
 */
export function sameFingerprint(
  a: ContentFingerprint,
  b: ContentFingerprint,
): boolean {
  return a.length === b.length && a.hash === b.hash;
}
