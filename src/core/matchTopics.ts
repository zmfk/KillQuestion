/**
 * 把考点挂到题目上。
 *
 * scripts/match_keypoints.py 用的是人工整理的词表（每个考点 2—7 个 strong 词），
 * 那是针对某一版题库调过的，换一份 PDF 就不适用。所以这里从考点标题自动派生关键词：
 *
 *   1. 去掉「关于 / 的有关内容 / 的基本原则 / 的核心意义」这类套话；
 *   2. 按「的、与、和、及、，」切成词段，留下 2 字以上的实词作为主词；
 *   3. 主词再剥掉「精神 / 建设 / 制度 / 体系」这类词尾，得到弱词（「长征精神」→「长征」）；
 *   4. 用词频给词分档：只在少数题里出现的词（专名）命中就是强信号，
 *      满库都有的词（「根本」「工作」）命中不加多少分，不能单独触发。
 *
 * 口径仍是偏严：漏标只是少刷几道重点题，错标会让「重点刷题」变得不可信。
 */
import type { Question, Topic } from '../types';

/** 标题里的套话，先整块删掉再切词 */
const FILLER = [
  '的有关内容',
  '有关内容',
  '的相关内容',
  '相关内容',
  '的基本原则',
  '基本原则',
  '的基本特征',
  '基本特征',
  '的基本职能',
  '标志性事件',
  '重要历史意义',
  '历史意义',
  '指导意义',
  '核心内涵',
  '核心意义',
  '核心要求',
  '核心内容',
  '重要论述',
  '重要作用',
  '重要会议',
  '重大成就',
  '目标方向',
  '政策取向',
  '总体要求',
  '基本要求',
  '工作重点',
  '责任与使命',
  '指导思想体系',
  '指导思想',
  '有关情况',
  '有关',
  '关于',
  '基本',
  '主要',
  '重要',
  '核心',
  '内涵',
  '意义',
  '作用',
  '方向',
  '领域',
  '事件',
  '任务',
  '要求',
  '原则',
  '目标',
  '内容',
];
/** 词尾的类名，剥掉后往往就是题干里真正出现的那个词 */
const TAIL = [
  '精神',
  '建设',
  '制度',
  '体系',
  '工作',
  '理论',
  '思想',
  '会议',
  '大会',
  '事件',
  '成就',
  '经验',
  '方针',
  '政策',
  '举措',
  '要求',
  '内容',
  '原则',
  '目标',
  '方向',
];
/** 切词用的虚词与标点 */
const SPLIT = /[的与和及、，,；;：:？?！!（）()“”"'\s]+/;
/** 词段首尾要剃掉的虚字（只剃真虚字：单字「国」「党」不能剃，会把「国体」「党内民主」剃坏） */
const EDGE =
  /^(?:在|于|对|从|以|为|了|是|其|之|等|把|被|由|向|到|并|而|也|就|该|这一|一个|我国|党的|中共)+|(?:等|的|之|上|下|中)+$/g;

export interface TopicRule {
  id: string;
  title: string;
  /** 主词：从标题切出来的实词 */
  terms: string[];
  /** 弱词：主词剥掉类名词尾后的短词 */
  soft: string[];
  /** 标题自身的 4 字连续片段：不受切词错误影响，撞上就是强信号 */
  grams: string[];
  groupSection: string;
}

export function norm(s: string): string {
  return (s ?? '').replace(/\s+/g, '');
}

/** 标题先剃套话，主词和 4 字片段都基于这一版，免得「历史意义」这种尾缀去撞满库 */
function cleanTitle(title: string): string {
  let s = norm(title).replace(/[“”"']/g, '');
  for (const f of FILLER) s = s.split(f).join('');
  return s;
}

/** 考点标题 → 主词 */
export function termsOf(topic: Topic): string[] {
  const title = cleanTitle(topic.title);
  const out: string[] = [];
  for (const piece of title.split(SPLIT)) {
    const t = piece.replace(EDGE, '').replace(EDGE, '');
    if (t.length < 2 || t.length > 14) continue;
    if (/^\d+$/.test(t) && t.length < 3) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 主词 → 弱词（剥类名词尾；剥完太短或无变化就不生成） */
export function softOf(terms: string[]): string[] {
  const out: string[] = [];
  for (const term of terms) {
    for (const tail of TAIL) {
      if (!term.endsWith(tail)) continue;
      const stem = term.slice(0, -tail.length);
      if (stem.length >= 2 && stem !== term && !terms.includes(stem) && !out.includes(stem)) out.push(stem);
    }
  }
  return out;
}

/**
 * 标题的 4 字连续片段：不受切词错误影响，但 4 个字也容易撞车
 * （「中国工人」既在「中国工人阶级…」里，也在「中国工人、农民、军人…」里），
 * 所以命中后还要看主词是否也命中，见 scoreAgainst。
 */
export function gramsOf(title: string): string[] {
  const s = cleanTitle(title).replace(/[（）()]/g, '');
  const out: string[] = [];
  for (let i = 0; i + 4 <= s.length; i += 1) {
    const g = s.slice(i, i + 4);
    if (/^[\u4e00-\u9fa5]{4}$/.test(g) && !out.includes(g)) out.push(g);
  }
  return out;
}

export function rulesOf(topics: Topic[]): TopicRule[] {
  return topics.map((t) => {
    const terms = termsOf(t);
    return {
      id: t.id,
      title: t.title,
      terms,
      soft: softOf(terms),
      grams: gramsOf(t.title),
      groupSection: norm(t.section).replace(/^[一二三四五六七八九十]+[、.]?/, ''),
    };
  });
}

function questionText(q: Question): string {
  const parts = [q.stem, q.material ?? '', q.answerText ?? ''];
  for (const o of q.options ?? []) parts.push(o.text);
  return norm(parts.join(''));
}

export interface MatchReport {
  tagged: number;
  total: number;
  perTopic: Record<string, number>;
  /** 命中率过低时给个提醒，通常是「划重点和题库不是同一版」 */
  warning?: string;
}

const MIN_SCORE = 5;
const MAX_PER_QUESTION = 3;
/** 词出现在多少比例的题里算「满库都有」：超过这个比例的词，命中不加分、也不能单独触发 */
const COMMON_RATIO = 0.03;

export function matchTopics(
  questions: Question[],
  topics: Topic[],
): { questions: Question[]; topics: Topic[]; report: MatchReport } {
  const rules = rulesOf(topics);
  const texts = questions.map(questionText);

  // 只为考点里出现过的词算词频，题目再多也不会炸
  const vocab = new Set<string>();
  for (const r of rules) {
    for (const w of r.terms) vocab.add(w);
    for (const w of r.soft) vocab.add(w);
    for (const w of r.grams) vocab.add(w);
  }
  const df = new Map<string, number>();
  for (const word of vocab) {
    let n = 0;
    for (const text of texts) if (text.includes(word)) n += 1;
    df.set(word, n);
  }
  const commonLimit = Math.max(2, Math.ceil(texts.length * COMMON_RATIO));
  const isCommon = (w: string) => (df.get(w) ?? 0) > commonLimit;

  const perTopic: Record<string, number> = {};
  let tagged = 0;

  const taggedQuestions = questions.map((q, qi) => {
    const text = texts[qi];
    const scored = rules
      .map((rule) => {
        let score = 0;
        let strong = false;
        const hits: Array<{ word: string; common: boolean }> = [];
        const consider = (word: string, kind: 'term' | 'soft') => {
          if (!text.includes(word)) return;
          const common = isCommon(word);
          hits.push({ word, common });
          const base = word.length >= 4 ? 5 : word.length === 3 ? 3 : 1;
          // 满库都有的词：只按主词的小头计分，且永不单独触发
          if (kind === 'term' && !common) {
            score += base;
            if (word.length >= 4) strong = true;
          } else if (kind === 'term') {
            score += 1;
          } else if (!common) {
            // 稀有弱词（专名级）：命中就是强信号
            score += Math.max(1, Math.ceil(base / 2)) + 3;
            strong = true;
          } else {
            score += 1;
          }
        };
        for (const word of rule.terms) consider(word, 'term');
        for (const word of rule.soft) consider(word, 'soft');
        // 标题里的 4 字片段撞上就算实锤：这是自动标注的主要信号（对比过，靠它才能把重点题
        // 做到与人工词表相当的量级）。满库都有的片段（「中国共产」「历史意义」）已被 isCommon 挡掉，
        // 剩下的误伤率约 1 成——比起漏掉重点题，多标几道可以接受。
        const gram = rule.grams.find((g) => !isCommon(g) && text.includes(g));
        if (gram) {
          hits.push({ word: gram, common: false });
          score += 6;
          strong = true;
        }
        // 两个「不常见」的词同时出现才算撞上：同一个概念被切成两半（「党的二十大报告」+「党的二十大」）
        // 会同时命中，那种情况不该算。
        if (!strong && hits.filter((h) => !h.common).length >= 2) {
          score += 3;
          strong = true;
        }
        return { rule, score, strong, hits: hits.map((h) => h.word) };
      })
      .filter((s) => s.strong && s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PER_QUESTION);

    const topicIds = scored.map((s) => s.rule.id);
    if (topicIds.length > 0) tagged += 1;
    for (const id of topicIds) perTopic[id] = (perTopic[id] ?? 0) + 1;
    return { ...q, topicIds };
  });

  const ratio = questions.length > 0 ? tagged / questions.length : 0;
  const report: MatchReport = { tagged, total: questions.length, perTopic };
  if (questions.length > 0 && topics.length > 0 && ratio < 0.15) {
    report.warning =
      `只有 ${Math.round(ratio * 100)}% 的题能和考点对上。多半是划重点和题库不是同一版，` +
      '重点刷题会很不准——建议先只用「大范围刷题」，或者换一份配套的划重点。';
  }
  return {
    questions: taggedQuestions,
    topics: topics.map((t) => ({ ...t, count: perTopic[t.id] ?? 0 })),
    report,
  };
}
