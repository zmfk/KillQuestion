/**
 * 简答 / 论述的「打字作答 + 对照参考答案」判分。
 *
 * 这两类题没有唯一答案，所以不做严格比对，也不假装能判准：
 *   1. 把参考答案拆成要点句（先按「（一）」「①」这类标记分段，段内再按句拆）；
 *   2. 每条要点取关键片段（中文 bigram + 数字/拉丁整词，滤掉「的、是、和」这类虚字组合）；
 *   3. 用户输入同样取片段，统计每条要点被命中的比例，再按要点长度加权汇总；
 *   4. 汇总分到阈值就判对，但页面上逐条给出「答到 / 没答到」，并允许用户推翻本次判定。
 *
 * 局限说清楚：这是词面匹配，同义改写（「工人阶级」↔「无产阶级」）算不中。
 * 所以它是「参照分」，不是裁判——最终仍由用户在页面上改判。
 */
import type { Question } from '../types';

/** 汇总匹配度达到这个值就自动判对（用户可改判） */
export const ESSAY_PASS_RATIO = 0.55;
/** 单条要点里这个比例的关键片段被命中，就算「答到」 */
export const POINT_COVER_RATIO = 0.6;
/** 短于这个字数的句子不单列要点，并进上一句（「言之有理即可」这类尾巴） */
const MIN_POINT_LEN = 6;

/** 分点标记：（一）/（1）/①/句首或行首的 1. 2、 */
const POINT_MARKER_RE =
  /[（(]\s*[一二三四五六七八九十百0-9]{1,3}\s*[）)]|[①-⑩]|(?:^|(?<=[。；;\n]))\s*\d{1,2}\s*[.、]/g;

/** 句子分隔：。；！？换行（逗号不拆，一拆就碎） */
const SENTENCE_SPLIT_RE = /[。；;！!？?\n]+/;

/** 次级分隔：一整个长句里再用逗号 / 顿号切成要点，免得几百字的段落只算「一条要点」 */
const CLAUSE_SPLIT_RE = /[，,、]+/;

/** 超过这个字数的句子才做次级拆分，短句保持一整条（28 是拿真实题库试出来的：再低就拆碎） */
const CLAUSE_SPLIT_MIN_LEN = 28;

/** 归一时剥掉的标点与符号 */
const STRIP_RE = /[\s，。；：、！？（）()《》〈〉“”'"'‘’「」『』·\-—…~～*#>|/\\[\]{}【】]/g;

/** 单个字里全是这些就没信息量（「的是」「和的」这种 bigram 直接丢） */
const STOP_CHARS = new Set(
  '的了是在和有与及或对为从以把被要会能并等都也就而其中上下个们还又很再只才已没无之其这那我你他她它可若则因所于将把向等即'.split(''),
);

/** 归一：全角转半角、小写、去标点空白。答案与输入走同一套，否则口径不可比 */
export function normalizeAnswerText(text: string): string {
  return (text ?? '').normalize('NFKC').toLowerCase().replace(STRIP_RE, '');
}

/**
 * 关键片段：连续文本上取 2-gram（中文基本单位），拉丁字母与数字也按 2 字滑窗，
 * 这样一个规则覆盖「中国」「1921」「三个代表」三种写法，不用凑分词表。
 */
export function keyGrams(text: string): string[] {
  const clean = normalizeAnswerText(text);
  if (clean.length < 2) return clean === '' ? [] : [clean];
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    const gram = clean.slice(i, i + 2);
    // 两个字都是虚字 → 没有信息量，丢掉（否则「的的」「和和」会灌水）
    if (STOP_CHARS.has(gram[0]) && STOP_CHARS.has(gram[1])) continue;
    out.push(gram);
  }
  return out;
}

/**
 * 参考答案拆要点。分点标记优先，段内再按句拆；
 * 太短的残句（「言之有理即可」）并进上一句，免得它拉低匹配度。
 */
export function splitAnswerPoints(answer: string): string[] {
  const text = (answer ?? '').trim();
  if (text === '') return [];

  const chunks: string[] = [];
  let cursor = 0;
  for (const match of text.matchAll(POINT_MARKER_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) chunks.push(text.slice(cursor, start));
    cursor = start + match[0].length;
  }
  if (cursor < text.length) chunks.push(text.slice(cursor));

  const raw: string[] = [];
  for (const chunk of chunks) {
    for (const sentence of chunk.split(SENTENCE_SPLIT_RE)) {
      const trimmed = sentence.trim();
      if (trimmed === '') continue;
      // 长句再按逗号/顿号切，让「逐条对照」真的看得出缺哪几点
      if (normalizeAnswerText(trimmed).length > CLAUSE_SPLIT_MIN_LEN) {
        for (const clause of trimmed.split(CLAUSE_SPLIT_RE)) {
          const piece = clause.trim();
          if (piece !== '') raw.push(piece);
        }
      } else {
        raw.push(trimmed);
      }
    }
  }

  const points: string[] = [];
  for (const sentence of raw) {
    const last = points.length - 1;
    if (points.length > 0 && normalizeAnswerText(sentence).length < MIN_POINT_LEN) {
      points[last] = `${points[last]}；${sentence}`;
    } else {
      points.push(sentence);
    }
  }
  return points.length > 0 ? points : [text];
}

export interface PointMatch {
  /** 参考答案里这一条要点（原文，便于用户逐条对照） */
  text: string;
  /** 这一条的关键片段被命中比例 0..1 */
  ratio: number;
  /** ratio 是否达到 POINT_COVER_RATIO */
  covered: boolean;
}

export interface EssayVerdict {
  /** 汇总匹配度是否达到阈值（自动判定，可被用户改判） */
  correct: boolean;
  /** 加权汇总匹配度 0..1 */
  score: number;
  /** 判对阈值，页面直接显示，别让用户猜 */
  passRatio: number;
  points: PointMatch[];
  /** 答到的要点数 / 要点总数 */
  matched: number;
  total: number;
}

/**
 * 简答 / 论述判分入口。
 * 没有参考答案、或用户压根没写（少于 2 个字）时返回 null，
 * 交给原来的「看答案 + 自评」流程，而不是硬判错。
 */
export function gradeEssayAnswer(question: Question, input: string): EssayVerdict | null {
  const reference = (question.answerText ?? '').trim() || (question.answer ?? []).join('；').trim();
  if (reference === '') return null;
  // 一两个字不算作答，走「看答案 + 自评」，别把「不知道」当答错记进去
  if (normalizeAnswerText(input ?? '').length < 2) return null;

  const pointTexts = splitAnswerPoints(reference);
  const answerGroups = pointTexts.map((text) => keyGrams(text));
  if (answerGroups.length === 0 || answerGroups.every((g) => g.length === 0)) return null;

  const userGrams = new Set(keyGrams(input ?? ''));
  if (userGrams.size === 0) return null;

  let hit = 0;
  let total = 0;
  const points: PointMatch[] = [];
  pointTexts.forEach((text, i) => {
    const grams = answerGroups[i] ?? [];
    if (grams.length === 0) {
      points.push({ text, ratio: 0, covered: false });
      return;
    }
    let pointHit = 0;
    for (const gram of grams) if (userGrams.has(gram)) pointHit += 1;
    const ratio = pointHit / grams.length;
    hit += pointHit;
    total += grams.length;
    points.push({ text, ratio, covered: ratio >= POINT_COVER_RATIO });
  });

  const score = total === 0 ? 0 : hit / total;
  return {
    correct: score >= ESSAY_PASS_RATIO,
    score,
    passRatio: ESSAY_PASS_RATIO,
    points,
    matched: points.filter((p) => p.covered).length,
    total: points.length,
  };
}
