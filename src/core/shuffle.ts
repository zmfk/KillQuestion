import type { Rng } from './rng';

/**
 * Fisher–Yates 洗牌，返回新数组。
 * 每次作答只洗一次（调用方负责），因此洗牌本身必须是纯的：不碰入参。
 */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    // rng 契约是 [0,1)，min(i, ...) 只是防止外部 rng 越界时写出 undefined
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/** 选项字母只在这里生成：正确项存 id，字母永远是渲染时按顺序现算的。 */
export const optionLetters = (count: number): string[] => {
  const n = Number.isFinite(count) ? Math.max(0, Math.min(26, Math.floor(count))) : 0;
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
};

export interface ShufflableOption {
  id: string;
}

/**
 * 位置相关选项（「以上都对」）一旦被打乱就失去意义，所以整题锁定。
 * 锁定时按原顺序返回副本——仍返回副本，调用方可以放心 append/修改。
 */
export function shuffleOptions<T extends ShufflableOption>(
  options: readonly T[],
  shuffleLocked: boolean,
  rng: Rng,
): T[] {
  return shuffleLocked ? options.slice() : shuffle(options, rng);
}
