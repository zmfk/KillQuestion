/**
 * 一次导入的完整流水线：题库（PDF / DOCX 的文本，或现成的 JSON）+ 可选划重点 → BankData。
 *
 * 三种来源可以任意组合：
 *   - 只有题库文本：解析出题，所有题都没有考点，「重点刷题」暂时无数据；
 *   - 只有划重点：把本机已有题库重新标注一遍（换一版划重点时用）；
 *   - 题库 + 划重点：解析 + 标注一次做完。
 * 现成的题库 JSON 直接进（保留它自带的考点标注），除非又拖了一份划重点要求重标。
 */
import type { BankData, Question, Topic } from '../types';
import { matchTopics } from './matchTopics';
import type { MatchReport } from './matchTopics';
import { parseBankText, toBankQuestions } from './parseBank';
import { parseTopicsText } from './parseTopics';

export interface BuildOptions {
  /** PDF / DOCX / TXT 抽出来的文本；给了现成题目时可以不传 */
  bankText?: string;
  /** 划重点文本 */
  topicsText?: string;
  /** 现成的题目（来自题库 JSON，或本机已有的题库） */
  existingQuestions?: Question[];
  /** 现成的考点（来自题库 JSON 自带的 topics） */
  existingTopics?: Topic[];
  /** 已带考点标注的题要不要按新划重点重标 */
  retag?: boolean;
  title?: string;
}

export interface BuildReport {
  total: number;
  counters: Record<string, number>;
  sections: string[];
  topicCount: number;
  tagged: number;
  perTopic: Record<string, number>;
  warnings: string[];
  match: MatchReport | null;
}

export interface BuildResult {
  data: BankData;
  report: BuildReport;
}

export function counterOf(questions: Question[]): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const q of questions) counters[q.type] = (counters[q.type] ?? 0) + 1;
  return counters;
}

export function reportOf(data: BankData, warnings: string[] = []): BuildReport {
  return {
    total: data.questions.length,
    counters: counterOf(data.questions),
    sections: [],
    topicCount: data.topics.length,
    tagged: data.meta.keyTotal,
    perTopic: Object.fromEntries(
      data.topics.map((t) => [t.id, data.questions.filter((q) => q.topicIds.includes(t.id)).length]),
    ),
    warnings,
    match: null,
  };
}

export function buildBank(opts: BuildOptions): BuildResult {
  const warnings: string[] = [];
  let questions: Question[];
  let sections: string[] = [];

  if (opts.existingQuestions) {
    questions = opts.existingQuestions.map((q) => ({ ...q, topicIds: [...(q.topicIds ?? [])] }));
  } else {
    if (!opts.bankText) throw new Error('没有可解析的内容。');
    const parsed = parseBankText(opts.bankText);
    warnings.push(...parsed.warnings);
    sections = parsed.sections;
    if (parsed.questions.length === 0) {
      throw new Error(
        parsed.warnings[0] ??
          '这份文件里没解析出题目。常见原因：PDF 是扫描件（图片）、或者版式和「一、填空题 / 二、选择题」差太多。',
      );
    }
    questions = toBankQuestions(parsed.questions);
  }

  // 考点表：新给的划重点优先，其次用 JSON 自带的
  let topics: Topic[] = [];
  if (opts.topicsText && opts.topicsText.trim()) {
    const parsedTopics = parseTopicsText(opts.topicsText);
    warnings.push(...parsedTopics.warnings);
    topics = parsedTopics.topics;
    sections = sections.length > 0 ? sections : [];
  } else if (opts.existingTopics && opts.existingTopics.length > 0) {
    topics = opts.existingTopics.map((t) => ({ ...t }));
  }

  const alreadyTagged = questions.some((q) => (q.topicIds?.length ?? 0) > 0);
  const shouldMatch = topics.length > 0 && (opts.retag ?? !alreadyTagged);

  let match: MatchReport | null = null;
  if (shouldMatch) {
    const matched = matchTopics(questions, topics);
    questions = matched.questions;
    topics = matched.topics;
    match = matched.report;
    if (matched.report.warning) warnings.push(matched.report.warning);
  } else {
    topics = topics.map((t) => ({
      ...t,
      count: questions.filter((q) => q.topicIds.includes(t.id)).length,
    }));
  }

  const counters = counterOf(questions);
  const data: BankData = {
    version: 1,
    meta: {
      title: (opts.title ?? '题库').slice(0, 80),
      total: questions.length,
      counters,
      keyTotal: questions.filter((q) => q.topicIds.length > 0).length,
    },
    topics,
    questions,
  };

  return {
    data,
    report: {
      total: questions.length,
      counters,
      sections,
      topicCount: topics.length,
      tagged: data.meta.keyTotal,
      perTopic: match?.perTopic ?? reportOf(data).perTopic,
      warnings,
      match,
    },
  };
}
