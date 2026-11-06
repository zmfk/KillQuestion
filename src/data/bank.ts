import { normalizeJudge } from '../core/grade';
import type { BankData, KeyOverrides, Option, Question, Topic } from '../types';

/**
 * 题库运行时索引。题库不打包进仓库，由用户导入后存在本机，
 * 所以所有查询都必须基于这份索引，而不是模块级常量。
 */
export interface BankIndex {
  data: BankData;
  questions: Question[];
  topics: Topic[];
  questionById: Map<string, Question>;
  topicById: Map<string, Topic>;
  /** 当前生效的重点题 id（已把手动提升 / 降级算进去） */
  keyIds: string[];
  allIds: string[];
}

/** 单题是否重点：手动改过就听手动的，没改过按题库的考点标注算 */
export function isKeyQuestion(q: Question, overrides: KeyOverrides | undefined): boolean {
  const forced = overrides?.[q.id];
  if (forced !== undefined) return forced;
  return (q.topicIds?.length ?? 0) > 0;
}

/** 把手动调整算进索引：只重算 keyIds，题目本身（考点标注、答案）一个字都不动 */
export function withKeyOverrides(index: BankIndex, overrides: KeyOverrides | undefined): BankIndex {
  return {
    ...index,
    keyIds: index.questions.filter((q) => isKeyQuestion(q, overrides)).map((q) => q.id),
  };
}

export function indexBank(data: BankData, overrides?: KeyOverrides): BankIndex {
  const questions = data.questions ?? [];
  const topics = data.topics ?? [];
  return {
    data,
    questions,
    topics,
    questionById: new Map(questions.map((q) => [q.id, q])),
    topicById: new Map(topics.map((t) => [t.id, t])),
    keyIds: questions.filter((q) => isKeyQuestion(q, overrides)).map((q) => q.id),
    allIds: questions.map((q) => q.id),
  };
}

const TYPES = new Set(['single', 'multi', 'judge', 'fill', 'short', 'essay']);

/**
 * 答案字段规范化。生成题库（AI 转 JSON、OCR、旧版导出）里常见这些写法：
 * `"answer": "xxx"`（字符串）、`"answer": [""]`、`"answer"` 缺失、`"answer": null`。
 * 统一成「字符串数组」，否则后面判分、选项映射、背题稿各拿各的形态。
 */
function normalizeAnswerList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? '')).filter((text) => text !== '');
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text === '' ? [] : [text];
  }
  return [];
}

/** 选项规范化：只认 {key,text} 形状，缺 key 时按位置补 A、B、C… */
function normalizeOptions(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((opt) => opt && typeof opt === 'object')
    .map((opt, i) => {
      const item = opt as Partial<Option>;
      return {
        key: String(item.key ?? String.fromCharCode(65 + Math.min(i, 25))),
        text: String(item.text ?? ''),
      };
    })
    .filter((opt) => opt.text !== '');
}

/** 导入前校验：结构不对就直接报错，别把半截数据写进本机。 */
export function validateBank(raw: unknown): BankData {
  if (typeof raw !== 'object' || raw === null) throw new Error('文件不是 JSON 对象');
  const data = raw as Partial<BankData>;
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('缺少 questions 数组');
  }
  const seen = new Set<string>();
  data.questions.forEach((q, i) => {
    if (!q || typeof q.id !== 'string') throw new Error(`第 ${i + 1} 题缺少 id`);
    if (seen.has(q.id)) throw new Error(`题目 id 重复：${q.id}`);
    seen.add(q.id);
    if (!TYPES.has(q.type)) throw new Error(`${q.id} 的题型不认识：${String(q.type)}`);
    if (typeof q.stem !== 'string' || q.stem.trim() === '') {
      throw new Error(`${q.id} 缺少题干`);
    }
    if (!Array.isArray(q.topicIds)) q.topicIds = [];
    q.answer = normalizeAnswerList(q.answer);
    // answerText 是判分和「参考答案」展示的主来源，缺了就用 answer 拼一份
    if (typeof q.answerText !== 'string') q.answerText = q.answer.join('；');
    if (q.type === 'single' || q.type === 'multi') q.options = normalizeOptions(q.options);
    // 填空题的空位数：缺失 / 非正数时按答案条数兜底，保证答题页至少有一个输入框
    if (q.type === 'fill') {
      const blanks = Math.floor(Number(q.blanks));
      q.blanks = Number.isFinite(blanks) && blanks > 0 ? blanks : Math.max(1, q.answer.length);
    }
    // 判断题的答案写法很杂（√ / 对 / T / 正确），导入时统一成「正确 / 错误」，
    // 免得背题稿、题库页、判分各认一套。认不出来的原样留着，判分时按「需自评」处理。
    if (q.type === 'judge') {
      const fixed = normalizeJudge(q.answer?.[0] ?? '') ?? normalizeJudge(q.answerText ?? '');
      if (fixed !== null) {
        q.answer = [fixed];
        q.answerText = fixed;
      }
    }
  });
  if (!Array.isArray(data.topics)) data.topics = [];
  if (!data.meta || typeof data.meta !== 'object') {
    data.meta = {
      title: '题库',
      total: data.questions.length,
      counters: {},
      keyTotal: data.questions.filter((q) => q.topicIds.length > 0).length,
    };
  }
  return data as BankData;
}

export function topicsOf(q: Question, topicById: ReadonlyMap<string, Topic>): Topic[] {
  return (q.topicIds ?? [])
    .map((id) => topicById.get(id))
    .filter((t): t is Topic => t !== undefined);
}

export function questionNoLabel(q: Question): string {
  return `${q.sectionLabel ?? '题目'} 第 ${q.no ?? 0} 题`;
}

export function typeLabel(type: string): string {
  switch (type) {
    case 'single':
      return '单选';
    case 'multi':
      return '多选';
    case 'judge':
      return '判断';
    case 'fill':
      return '填空';
    case 'short':
      return '简答';
    case 'essay':
      return '论述';
    default:
      return type;
  }
}
