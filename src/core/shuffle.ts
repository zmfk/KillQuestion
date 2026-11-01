import type { Rng } from './rng';
import type { Option } from '../types';

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
  key: string;
  text: string;
}

/**
 * 位置相关选项（「以上都对」）一旦被打乱就失去意义，所以整题锁定。
 * 锁定时按原顺序返回副本——仍返回副本，调用方可以放心 append/修改。
 */
export function shuffleOptions<T extends object>(
  options: readonly T[],
  shuffleLocked: boolean,
  rng: Rng,
): T[] {
  return shuffleLocked ? options.slice() : shuffle(options, rng);
}

/**
 * 「以上都对 / 上述均不正确 / 全部正确」这类选项指向的是位置而不是内容，
 * 换了位置题目就自相矛盾，所以整题锁原顺序。
 */
const POSITIONAL_OPTION_RE = /^(?:以上|上述)|都对|都错|都不对|均对|均不对|全部正确|全部错误/;

/** 这题的选项里有没有位置相关的写法规避打乱 */
export function hasPositionalOption(options: readonly Option[]): boolean {
  return options.some((opt) => POSITIONAL_OPTION_RE.test((opt.text ?? '').trim()));
}

export interface ShuffledChoice {
  /** 按显示顺序重排后的选项，字母按位置重新编 A、B、C…（与题库原字母无关） */
  options: Option[];
  /** 与 options 同口径的正确字母，可直接交给 gradeChoice 判分 */
  answer: string[];
  /** 是否换了位置：false 表示命中位置锁定，按题库原顺序出题 */
  shuffled: boolean;
}

/**
 * 选择题出题时的选项打乱：顺序换、字母跟着位置重编、答案同步换字母。
 *
 * 关键是三者必须同时改：只要有一处还留着题库原字母，就会出现
 * 「选项写着 A 却在第三个位置」或者「判分按旧字母比」的错判。
 * 所以这里一次性返回配套的 options + answer，调用方不要自己拼。
 */
export function shuffleChoiceOptions(
  options: readonly Option[],
  answer: readonly string[],
  rng: Rng,
): ShuffledChoice {
  const locked = hasPositionalOption(options);
  // 复用 shuffleOptions 的分支，锁定语义只有一处定义
  const order = shuffleOptions(options, locked, rng);
  const letters = optionLetters(order.length);
  const shown: Option[] = order.map((opt, i) => ({ key: letters[i], text: opt.text }));

  const letterOf = new Map<string, string>();
  order.forEach((opt, i) => {
    // 题库若出现重复字母，以第一次出现的位置为准，后面的不覆盖
    if (!letterOf.has(opt.key)) letterOf.set(opt.key, letters[i]);
  });

  const mapped: string[] = [];
  for (const key of answer) {
    // 原题库里指向不存在选项的字母照样保留，判分时按「选不到 = 错」处理，
    // 免得把一个数据错误悄悄变成「自动判对」
    const letter = letterOf.get(key) ?? key;
    if (!mapped.includes(letter)) mapped.push(letter);
  }
  mapped.sort();

  return {
    options: shown,
    answer: mapped,
    shuffled: !locked && order.some((opt, i) => opt.key !== letters[i]),
  };
}

/** 洗牌种子：每次出题都要一个新顺序，同一次出题内（渲染、判分）必须是同一个 */
export function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}
