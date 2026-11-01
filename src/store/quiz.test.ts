import { beforeEach, describe, expect, it } from 'vitest';
import { useQuiz } from './quiz';
import type { BankData, Question } from '../types';

/**
 * 这里验的是「出题时选项被打乱、答案同步」这条线是否真的接上了：
 * 页面拿到的 current 就是上桌版，判分也读同一份，不用页面自己拼。
 */
const BANK: BankData = {
  version: 1,
  meta: { title: '测试题库', total: 2, counters: { single: 1, multi: 1 }, keyTotal: 2 },
  topics: [{ id: 'k01', section: '一、示例', title: '示例考点', count: 2 }],
  questions: [
    {
      id: 'Q1',
      type: 'single',
      no: 1,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '示例单选（）',
      options: [
        { key: 'A', text: '甲' },
        { key: 'B', text: '乙' },
        { key: 'C', text: '丙' },
        { key: 'D', text: '丁' },
      ],
      answer: ['D'],
      answerText: 'D',
      topicIds: ['k01'],
    },
    {
      id: 'Q2',
      type: 'multi',
      no: 2,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '示例多选（）',
      options: [
        { key: 'A', text: '子' },
        { key: 'B', text: '丑' },
        { key: 'C', text: '寅' },
        { key: 'D', text: '卯' },
      ],
      answer: ['B', 'D'],
      answerText: 'BD',
      topicIds: ['k01'],
    },
  ],
};

const SRC = new Map<string, Question>(BANK.questions.map((q) => [q.id, q]));

/** 题库里这道题的正确选项原文（与显示字母无关） */
function correctTexts(id: string): string[] {
  const q = SRC.get(id) as Question;
  return (q.answer ?? [])
    .map((k) => q.options?.find((o) => o.key === k)?.text ?? '')
    .sort();
}

function shownOptions() {
  const current = useQuiz.getState().current;
  if (!current) throw new Error('没有出题');
  return current;
}

beforeEach(() => {
  localStorage.clear();
  useQuiz.getState().clearBank();
  useQuiz.getState().importBankData(JSON.parse(JSON.stringify(BANK)) as BankData);
});

describe('出题时选项打乱', () => {
  it('字母按显示位置从 A 连排，选项原文一个不少', () => {
    useQuiz.getState().start('all');
    const current = shownOptions();
    expect(current.options?.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    const src = SRC.get(current.id) as Question;
    expect(current.options?.map((o) => o.text).sort()).toEqual(
      (src.options ?? []).map((o) => o.text).sort(),
    );
  });

  it('答案字母跟着正确项走，判分按新字母照样判对', () => {
    for (let round = 0; round < 20; round += 1) {
      useQuiz.getState().start('all');
      const quiz = useQuiz.getState();
      const current = shownOptions();
      const shownRight = (current.answer ?? [])
        .map((k) => current.options?.find((o) => o.key === k)?.text ?? '')
        .sort();
      expect(shownRight).toEqual(correctTexts(current.id));

      for (const letter of current.answer ?? []) quiz.togglePick(letter);
      useQuiz.getState().submit();
      expect(useQuiz.getState().lastCorrect).toBe(true);
    }
  });

  it('换一道题会重新打乱（同一题多次出现顺序会变）', () => {
    const seen = new Set<string>();
    for (let round = 0; round < 40; round += 1) {
      useQuiz.getState().start('all');
      const current = shownOptions();
      seen.add((current.options ?? []).map((o) => o.text).join(''));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('题库原题不被改动：背题稿 / 题库页仍是原顺序、原字母', () => {
    useQuiz.getState().start('all');
    shownOptions();
    const index = useQuiz.getState().index;
    for (const src of BANK.questions) {
      const stored = index?.questionById.get(src.id);
      expect(stored?.options?.map((o) => o.key)).toEqual(src.options?.map((o) => o.key));
      expect(stored?.answer).toEqual(src.answer);
    }
  });

  it('选了打乱后的错项判错', () => {
    useQuiz.getState().start('all');
    const quiz = useQuiz.getState();
    const current = shownOptions();
    const wrongLetter = (current.options ?? []).map((o) => o.key).find((k) => !(current.answer ?? []).includes(k)) as string;
    quiz.togglePick(wrongLetter);
    useQuiz.getState().submit();
    expect(useQuiz.getState().lastCorrect).toBe(false);
  });
});
