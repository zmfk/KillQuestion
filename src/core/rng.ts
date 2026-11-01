/** 随机源：返回 [0, 1) 的浮点数。注入而非全局，保证「同种子同序列」可测。 */
export type Rng = () => number;

/**
 * mulberry32 —— 32 位种子的确定性 PRNG。
 * 选它而不是 Math.random：序列可复现，重插位置的分布测试才有意义；
 * 且实现足够短，热路径上没有分配。
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // 除以 2^32，结果严格落在 [0, 1)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 取 [0, maxExclusive) 的整数；maxExclusive <= 1 或非有限值时恒为 0。 */
export function randomInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) return 0;
  const bound = Math.floor(maxExclusive);
  if (bound <= 1) return 0;
  const value = Math.floor(rng() * bound);
  // 注入的 rng 若越界返回 1，钳到 bound - 1，保证契约不被外部实现打破
  return value >= bound ? bound - 1 : value;
}
