// Mulberry32: fast, seedable 32-bit PRNG. Returns values in [0, 1).
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), z | 61))) >>> 0;
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 4294967296;
  };
}

// Derive a fresh RNG seeded deterministically from a (seed, index) pair.
export function rngForIndex(seed: number, index: number): () => number {
  return mulberry32((seed ^ (Math.imul(index, 0x9e3779b9) | 0)) >>> 0);
}
