/**
 * 背题稿：把整份题库摊平成「可以直接读、可以直接打印」的纯文字。
 *
 * 两个用处：
 *   - 「背题」页按这份文本的样子渲染成 HTML，一个大页面从头读到尾；
 *   - 同一份内容做「复制全文 / 下载 .txt」，方便丢进手机备忘录或打印出来。
 *
 * 所以这里只做纯函数、不碰 DOM，页面上需要强调的地方（正确选项加粗）自己拿结构去渲染，
 * 文本里的答案行则由 answerLine 统一口径。
 */
import type { BankData, Question, Topic } from '../types';

export interface ReciteOptions {
  /** 只收划过重点的题 */
  onlyKey?: boolean;
  /** 遮住答案（先自己回想，再翻答案） */
  hideAnswer?: boolean;
  /** 开头是否带考点清单 */
  withTopics?: boolean;
  /** 标题里的时间 */
  now?: Date;
}

/** 题型在稿子里的先后：填空 → 选择 → 简答 → 论述，跟原书小节一致 */
const SECTION_ORDER = ['fill', 'choice', 'short', 'essay'];

const SECTION_TITLE: Record<string, string> = {
  fill: '填空题',
  choice: '选择题',
  short: '简答题',
  essay: '论述题',
};

export interface ReciteGroup {
  section: string;
  title: string;
  questions: Question[];
}

export interface ReciteTopicGroup {
  section: string;
  topics: Topic[];
}

/** 按小节分组，顺序固定；认不出来的小节排在最后，免得内容被悄悄丢掉 */
export function groupQuestions(questions: Question[], onlyKey = false): ReciteGroup[] {
  const kept = onlyKey ? questions.filter((q) => (q.topicIds?.length ?? 0) > 0) : questions;
  const buckets = new Map<string, Question[]>();
  for (const q of kept) {
    const key = SECTION_ORDER.includes(q.section) ? q.section : 'other';
    const list = buckets.get(key) ?? [];
    list.push(q);
    buckets.set(key, list);
  }
  const order = [...SECTION_ORDER, 'other'];
  return order
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => ({
      section: key,
      title: SECTION_TITLE[key] ?? '其他题目',
      questions: buckets.get(key) ?? [],
    }));
}

/** 考点按它自己的小节分组，按题库里出现的先后排 */
export function groupTopics(topics: Topic[]): ReciteTopicGroup[] {
  const map = new Map<string, Topic[]>();
  for (const t of topics) {
    const key = t.section || '未分组';
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([section, list]) => ({ section, topics: list }));
}

/** 选择题的正确选项文字：字母 + 选项原文，省得回头再找第几项 */
export function correctOptionText(q: Question): string {
  const letters = q.answer ?? [];
  if (letters.length === 0) return '';
  return letters
    .map((key) => {
      const opt = q.options?.find((o) => o.key === key);
      return opt ? `${key}. ${opt.text}` : key;
    })
    .join(' / ');
}

/** 一道题的答案行（不含前缀「答案：」） */
export function answerLine(q: Question): string {
  if (q.type === 'single' || q.type === 'multi') {
    return correctOptionText(q) || '（原文未给答案）';
  }
  if (q.type === 'fill') {
    const blanks = q.answer ?? [];
    if (blanks.length === 0) return '（原文未给答案）';
    if (blanks.length === 1) return blanks[0] || '（原文未给答案）';
    return blanks.map((a, i) => `${i + 1}. ${a || '（空）'}`).join('   ');
  }
  const text = (q.answerText ?? '').trim() || (q.answer ?? []).join('');
  return text || '（原文未给答案）';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 整份背题稿。
 *
 * 论述题的材料常常一整段被多道题共用，逐题重复会把稿子撑得没法读，
 * 所以材料只在他第一次出现的地方印一遍，后面的题标「材料同上」。
 */
export function buildReciteText(data: BankData, opts: ReciteOptions = {}): string {
  const { onlyKey = false, hideAnswer = false, withTopics = true, now = new Date() } = opts;
  const groups = groupQuestions(data.questions ?? [], onlyKey);
  const total = groups.reduce((n, g) => n + g.questions.length, 0);
  const topics = data.topics ?? [];

  const out: string[] = [];
  out.push('KillQuestion 背题稿');
  out.push(
    `题库：${data.meta?.title || '题库'} · ${total} 题${onlyKey ? '（只看重点）' : ''}${
      topics.length > 0 ? ` · ${topics.length} 个考点` : ''
    }`,
  );
  out.push(`生成时间：${stamp(now)}`);
  out.push('');

  if (withTopics && topics.length > 0) {
    out.push('━━ 一、考点清单 ━━');
    for (const group of groupTopics(topics)) {
      out.push(group.section);
      group.topics.forEach((t) => {
        out.push(`  · ${t.title}${t.count > 0 ? `（${t.count} 题）` : '（题库暂未收录）'}`);
      });
    }
    out.push('');
  }

  out.push(`━━ ${withTopics && topics.length > 0 ? '二' : '一'}、全部题目 ━━`);
  out.push('');

  const seenMaterial = new Set<string>();

  groups.forEach((group) => {
    out.push(`【${group.title}】共 ${group.questions.length} 题`);
    out.push('');
    group.questions.forEach((q, i) => {
      const no = q.no || i + 1;
      if (q.material) {
        if (!seenMaterial.has(q.material)) {
          seenMaterial.add(q.material);
          out.push('  【材料】');
          q.material
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((line) => out.push(`  ${line}`));
          out.push('');
        } else {
          out.push('  【材料同上】');
        }
      }
      out.push(`${no}. ${q.stem.trim()}`);
      for (const opt of q.options ?? []) {
        out.push(`   ${opt.key}. ${opt.text}`);
      }
      out.push(hideAnswer ? '   答案：（先自己回想，再看答案）' : `   答案：${answerLine(q)}`);
      out.push('');
    });
  });

  if (total === 0) out.push('（这份题库里没有可列出的题目）');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
