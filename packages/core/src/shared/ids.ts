export interface IdGenerator {
  next(): string;
}

/** Random, collision-resistant ids for aggregates (compositions, reports). */
export const randomIdGenerator: IdGenerator = {
  next: () => globalThis.crypto.randomUUID(),
};

/** Deterministic ids for tests and for human-facing codes. */
export function sequentialIdGenerator(prefix = "id-", start = 1): IdGenerator {
  let n = start;
  return { next: () => `${prefix}${n++}` };
}
