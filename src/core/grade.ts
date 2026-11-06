/**
 * 判分规则。选择题比字母集合；判断题比「正确 / 错误」；
 * 填空做归一化后逐空比对；简答/论述没有标准答案可自动判，交给用户自评（返回 null）。
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

/** 判断题的两种取值，UI 与答案都按这两个词存 */
export const JUDGE_TRUE = '正确';
export const JUDGE_FALSE = '错误';

/** 判断题的各种写法归一化：√/对/是/T 都算「正确」，×/错/否/F 都算「错误」 */
const JUDGE_TRUE_ALIASES = new Set(['正确', '对', '√', '✓', '是', 't', 'true', '1', 'a']);
const JUDGE_FALSE_ALIASES = new Set(['错误', '错', '×', '✗', 'x', '否', 'f', 'false', '0', 'b']);

export function normalizeJudge(input: string): string | null {
  const s = normalizeFill(input);
  if (s === '') return null;
  if (JUDGE_TRUE_ALIASES.has(s)) return JUDGE_TRUE;
  if (JUDGE_FALSE_ALIASES.has(s)) return JUDGE_FALSE;
  return null;
}

/**
 * 判断题：归一化后与标准答案比对。
 * 答案本身读不懂（既不是「正确」也不是「错误」）就当判不出，交给上层按「无自动判分」处理。
 */
export function gradeJudge(question: Question, picked: readonly string[]): boolean {
  const want = normalizeJudge(question.answer?.[0] ?? '');
  if (want === null) return false;
  return normalizeJudge(picked[0] ?? '') === want;
}

/**
 * 题库里这道题有没有能拿来判分的参考答案。
 *
 * 生成题库（AI 转 JSON、OCR、残缺的 PDF）里出现「题在、答案空」很常见，
 * 这种题不该被判错，也不该让页面卡在「没东西可提交」上——统一退回自评。
 * 注意 answer 可能是字符串等脏数据（导入时会被 normalize），这里一律防御性读取。
 */
export function hasReferenceAnswer(question: Question): boolean {
  const list = Array.isArray(question.answer) ? question.answer : [];
  switch (question.type) {
    case 'single':
    case 'multi':
      return list.some((key) => String(key ?? '').trim() !== '');
    case 'fill':
      return list.some((text) => String(text ?? '').trim() !== '');
    case 'judge':
      return (
        normalizeJudge(list[0] ?? '') !== null || normalizeJudge(question.answerText ?? '') !== null
      );
    case 'short':
    case 'essay':
      return (question.answerText ?? '').trim() !== '' || list.join('').trim() !== '';
    default:
      return false;
  }
}

/**
 * 填空题：逐个空比对。
 * 只判「题库给了答案的空」：某个空没给答案（空串 / 只有标点）就不参与判定，
 * 免得一份缺答案的题库把用户判成满盘皆错。答案项比输入多时，缺的那些按漏答算错。
 */
export function gradeFill(question: Question, inputs: readonly string[]): boolean {
  const answers = Array.isArray(question.answer) ? question.answer : [];
  let judged = 0;
  for (let i = 0; i < answers.length; i += 1) {
    const accepts = splitAccepts(String(answers[i] ?? ''));
    if (accepts.length === 0) continue;
    judged += 1;
    if (!gradeBlank(accepts, inputs[i] ?? '')) return false;
  }
  return judged > 0;
}

/**
 * 自动判分入口。简答、论述返回 null，表示「需要用户自评」；
 * 判断题答案读不懂、选择 / 填空题库没给答案时也返回 null，同样交给自评。
 */
export function autoGrade(question: Question, picked: readonly string[]): boolean | null {
  // 没有参考答案就别硬判：判错会把一道没答案的题永远记成错题
  if (!hasReferenceAnswer(question)) return null;
  switch (question.type) {
    case 'single':
    case 'multi':
      return gradeChoice(Array.isArray(question.answer) ? question.answer : [], picked);
    case 'judge':
      if (normalizeJudge(question.answer?.[0] ?? '') === null) return null;
      return gradeJudge(question, picked);
    case 'fill':
      return gradeFill(question, picked);
    case 'short':
    case 'essay':
      return null;
    default:
      return null;
  }
}
