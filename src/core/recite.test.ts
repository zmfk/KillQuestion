import { describe, expect, it } from 'vitest';
import {
  answerLine,
  buildReciteText,
  correctOptionText,
  groupQuestions,
  groupTopics,
} from './reciteText';
import type { BankData, Question, Topic } from '../types';

/**
 * 背题稿的测试数据全是编的占位文字——这里要验的是「摊平之后顺序、答案、材料对不对」，
 * 跟任何真实题目无关。
 */
function q(partial: Partial<Question> & Pick<Question, 'id' | 'type' | 'stem'>): Question {
  return {
    no: 1,
    section: 'fill',
    sectionLabel: '填空题',
    topicIds: [],
    ...partial,
  };
}

const TOPICS: Topic[] = [
  { id: 'k01', section: '一、示例分组', title: '示例考点甲', count: 2 },
  { id: 'k02', section: '一、示例分组', title: '示例考点乙', count: 0 },
  { id: 'k03', section: '二、另一组', title: '示例考点丙', count: 1 },
];

const QUESTIONS: Question[] = [
  q({
    id: 'Q1',
    type: 'fill',
    no: 1,
    section: 'fill',
    sectionLabel: '填空题',
    stem: '示例概念是指（ ）。',
    answer: ['示例定义'],
    answerText: '示例定义',
  }),
  q({
    id: 'Q2',
    type: 'fill',
    no: 2,
    section: 'fill',
    sectionLabel: '填空题',
    stem: '示例流程依次是（ ）、（ ）。',
    answer: ['第一步', '第二步'],
    blanks: 2,
    topicIds: ['k01'],
  }),
  q({
    id: 'Q3',
    type: 'single',
    no: 1,
    section: 'choice',
    sectionLabel: '选择题',
    stem: '下面哪一个是示例选项？',
    options: [
      { key: 'A', text: '甲' },
      { key: 'B', text: '乙' },
    ],
    answer: ['B'],
    topicIds: ['k01'],
  }),
  q({
    id: 'Q4',
    type: 'multi',
    no: 2,
    section: 'choice',
    sectionLabel: '选择题',
    stem: '下面哪些属于示例选项？',
    options: [
      { key: 'A', text: '甲' },
      { key: 'B', text: '乙' },
      { key: 'C', text: '丙' },
    ],
    answer: ['A', 'C'],
  }),
  q({
    id: 'Q5',
    type: 'short',
    no: 1,
    section: 'short',
    sectionLabel: '简答题',
    stem: '示例简答题的问题是什么？',
    answerText: '示例答案第一点。示例答案第二点。',
    topicIds: ['k03'],
  }),
  q({
    id: 'Q6',
    type: 'essay',
    no: 1,
    section: 'essay',
    sectionLabel: '论述题',
    stem: '结合材料说明示例问题一。',
    material: '这是一段编出来的示例材料。',
    answerText: '示例回答一。',
  }),
  q({
    id: 'Q7',
    type: 'essay',
    no: 2,
    section: 'essay',
    sectionLabel: '论述题',
    stem: '结合材料说明示例问题二。',
    material: '这是一段编出来的示例材料。',
    answerText: '示例回答二。',
  }),
];

const BANK: BankData = {
  version: 1,
  meta: { title: '示例题库', total: QUESTIONS.length, counters: {}, keyTotal: 3 },
  topics: TOPICS,
  questions: QUESTIONS,
};

describe('groupQuestions', () => {
  it('按 填空 → 选择 → 简答 → 论述 排，与原文小节一致', () => {
    const groups = groupQuestions(QUESTIONS);
    expect(groups.map((g) => g.section)).toEqual(['fill', 'choice', 'short', 'essay']);
    expect(groups.map((g) => g.questions.length)).toEqual([2, 2, 1, 2]);
  });

  it('onlyKey 只留划过重点的题', () => {
    const groups = groupQuestions(QUESTIONS, true);
    const ids = groups.flatMap((g) => g.questions.map((x) => x.id));
    expect(ids).toEqual(['Q2', 'Q3', 'Q5']);
  });

  it('传了 keyIds 就按它认重点（手动提升 / 降级也算）', () => {
    // 把没挂考点的 Q1 提升为重点、把挂考点的 Q2 降为普通
    const keyIds = new Set(['Q1', 'Q3', 'Q5']);
    const groups = groupQuestions(QUESTIONS, true, keyIds);
    const ids = groups.flatMap((g) => g.questions.map((x) => x.id));
    expect(ids).toEqual(['Q1', 'Q3', 'Q5']);
  });

  it('认不出来的小节排到最后，不会被丢掉', () => {
    const odd = q({ id: 'QX', type: 'short', stem: '别的小节', section: 'appendix' });
    const groups = groupQuestions([...QUESTIONS, odd]);
    expect(groups.at(-1)?.section).toBe('other');
    expect(groups.at(-1)?.questions.map((x) => x.id)).toEqual(['QX']);
  });
});

describe('groupTopics', () => {
  it('按考点自己的小节分组，保持题库里的先后', () => {
    const groups = groupTopics(TOPICS);
    expect(groups.map((g) => g.section)).toEqual(['一、示例分组', '二、另一组']);
    expect(groups[0].topics.map((t) => t.id)).toEqual(['k01', 'k02']);
  });
});

describe('判断题', () => {
  const judge = q({
    id: 'QJ',
    type: 'judge',
    no: 1,
    section: 'judge',
    sectionLabel: '判断题',
    stem: '示例判断命题是否成立。',
    answer: ['正确'],
    answerText: '正确',
  });

  it('答案行给「正确 / 错误」，√ × 也归一化', () => {
    expect(answerLine(judge)).toBe('正确');
    expect(answerLine({ ...judge, answer: ['×'] })).toBe('错误');
    expect(answerLine({ ...judge, answer: [], answerText: '对' })).toBe('正确');
    expect(answerLine({ ...judge, answer: [], answerText: '' })).toBe('（原文未给答案）');
  });

  it('排在选择与简答之间', () => {
    const groups = groupQuestions([QUESTIONS[2], judge, QUESTIONS[4]]);
    expect(groups.map((g) => g.section)).toEqual(['choice', 'judge', 'short']);
    expect(groups[1].title).toBe('判断题');
  });
});

describe('answerLine / correctOptionText', () => {
  it('单选题给「字母 + 选项全文」', () => {
    expect(correctOptionText(QUESTIONS[2])).toBe('B. 乙');
    expect(answerLine(QUESTIONS[2])).toBe('B. 乙');
  });

  it('多选题把每个字母都展开', () => {
    expect(answerLine(QUESTIONS[3])).toBe('A. 甲 / C. 丙');
  });

  it('多空填空逐空编号', () => {
    expect(answerLine(QUESTIONS[1])).toBe('1. 第一步   2. 第二步');
  });

  it('没答案的题明确写出来，不留空', () => {
    const empty = q({ id: 'QE', type: 'single', stem: '没有答案的题', options: [] });
    expect(answerLine(empty)).toBe('（原文未给答案）');
  });
});

describe('buildReciteText', () => {
  it('考点清单与全部题目都在稿子里', () => {
    const text = buildReciteText(BANK, { now: new Date('2026-11-01T09:30:00') });
    expect(text).toContain('一、考点清单');
    expect(text).toContain('示例考点甲（2 题）');
    expect(text).toContain('示例考点乙（题库暂未收录）');
    expect(text).toContain('二、全部题目');
    expect(text).toContain('【填空题】共 2 题');
    expect(text).toContain('【选择题】共 2 题');
    expect(text).toContain('【简答题】共 1 题');
    expect(text).toContain('【论述题】共 2 题');
    expect(text).toContain('示例题库');
    expect(text).toContain('生成时间：2026-11-01 09:30');
  });

  it('每道题的题干和答案都摊出来了', () => {
    const text = buildReciteText(BANK);
    expect(text).toContain('1. 示例概念是指（ ）。');
    expect(text).toContain('答案：示例定义');
    expect(text).toContain('答案：B. 乙');
    expect(text).toContain('答案：示例答案第一点。示例答案第二点。');
  });

  it('论述题那份共用材料只印一遍，后面的标「材料同上」', () => {
    const text = buildReciteText(BANK);
    const first = text.indexOf('这是一段编出来的示例材料。');
    const second = text.indexOf('这是一段编出来的示例材料。', first + 1);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBe(-1);
    expect(text).toContain('【材料同上】');
  });

  it('onlyKey 时只剩重点题，标题里会说明', () => {
    const text = buildReciteText(BANK, { onlyKey: true });
    expect(text).toContain('只看重点');
    expect(text).toContain('下面哪一个是示例选项');
    expect(text).not.toContain('示例概念是指');
  });

  it('hideAnswer 只改答案行，题干照样在', () => {
    const text = buildReciteText(BANK, { hideAnswer: true });
    expect(text).toContain('示例概念是指（ ）。');
    expect(text).not.toContain('答案：示例定义');
    expect(text).toContain('答案：（先自己回想，再看答案）');
  });

  it('withTopics=false 时不带考点清单，编号从「一」开始', () => {
    const text = buildReciteText(BANK, { withTopics: false });
    expect(text).not.toContain('考点清单');
    expect(text).toContain('━━ 一、全部题目 ━━');
  });

  it('空题库也给出可读的一句，而不是空白', () => {
    const empty: BankData = {
      version: 1,
      meta: { title: '空', total: 0, counters: {}, keyTotal: 0 },
      topics: [],
      questions: [],
    };
    const text = buildReciteText(empty);
    expect(text).toContain('这份题库里没有可列出的题目');
  });
});
