import { normalizeJudge } from '../core/grade';
import type { BankData, Question, Topic } from '../types';

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
  keyIds: string[];
  allIds: string[];
}

export function indexBank(data: BankData): BankIndex {
  const questions = data.questions ?? [];
  const topics = data.topics ?? [];
  return {
    data,
    questions,
    topics,
    questionById: new Map(questions.map((q) => [q.id, q])),
    topicById: new Map(topics.map((t) => [t.id, t])),
    keyIds: questions.filter((q) => (q.topicIds?.length ?? 0) > 0).map((q) => q.id),
    allIds: questions.map((q) => q.id),
  };
}

const TYPES = new Set(['single', 'multi', 'judge', 'fill', 'short', 'essay']);

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
