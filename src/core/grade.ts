/**
 * 判分规则。选择题比字母集合；填空做归一化后逐空比对；
 * 简答/论述没有标准答案可自动判，交给用户自评（返回 null）。
 */
import type { Question } from '../types';

/**
 * 选择题：正确字母集与所选字母集相等。
 * 顺序无关；漏选、多选、空选都算错。
 */
export function gradeChoice(correct: readonly string[], picked: readonly string[]): boolean {
  const want = new Set(correct);
  const got = new Set(picked);
  if (want.size === 0 || got.size === 0) return false;
  if (want.size !== got.size) return false;
  for (const k of got) if (!want.has(k)) return false;
  return true;
}

// 零宽字符用户看不见，却能造成「看着一样但比较不等」，先删掉。
const ZERO_WIDTH_RE = /[\u200B-\u200F\u2028\u2029\uFEFF]/g;
// 句末标点、书名号、必要修饰都容忍，因为手打填空不会一字不差。
const TRAILING_PUNCT_RE = /[。．.;；,，、!?！？"'“”‘’]+$/;
const SOFT_PUNCT_RE = /[。．.;；,，、!?！？"'“”‘’（）()《》〈〉·]/g;

/**
 * 填空归一化：NFKC → 删零宽 → 删全部空白 → 大小写折叠 → 去标点。
 * 顺序固定，改了会让历史判定不可比。
 */
export function normalizeFill(input: string): string {
  let text = input.normalize('NFKC');
  text = text.replace(ZERO_WIDTH_RE, '');
  text = text.replace(/\s+/g, '');
  text = text.toLowerCase();
  text = text.replace(TRAILING_PUNCT_RE, '');
  text = text.replace(SOFT_PUNCT_RE, '');
  return text;
}

/** 单个空判定：任一可接受写法命中即对；空输入一律算错。 */
export function gradeBlank(accepts: readonly string[], input: string): boolean {
  const got = normalizeFill(input);
  if (got === '') return false;
  for (const accept of accepts) {
    const want = normalizeFill(accept);
    if (want === '' || want === '.' || want === '。') continue;
    if (want === got) return true;
  }
  return false;
}

/** 一个空可能对应多种写法，用「/」或「；」在答案里并列时拆开。 */
export function splitAccepts(text: string): string[] {
  return text
    .split(/[；;|/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 填空题：逐个空比对。空数与答案数不一致时，多的空按漏答算错。
 * 返回是否全对。
 */
export function gradeFill(question: Question, inputs: readonly string[]): boolean {
  const answers = question.answer ?? [];
  if (answers.length === 0) return false;
  const count = Math.max(answers.length, inputs.length);
  if (count === 0) return false;
  for (let i = 0; i < count; i += 1) {
    const accepts = splitAccepts(answers[i] ?? '');
    if (!gradeBlank(accepts, inputs[i] ?? '')) return false;
  }
  return true;
}

/**
 * 自动判分入口。简答、论述返回 null，表示「需要用户自评」。
 */
export function autoGrade(question: Question, picked: readonly string[]): boolean | null {
  switch (question.type) {
    case 'single':
    case 'multi':
      return gradeChoice(question.answer ?? [], picked);
    case 'fill':
      return gradeFill(question, picked);
    case 'short':
    case 'essay':
      return null;
    default:
      return null;
  }
}
