import { beforeEach, describe, expect, it } from 'vitest';
import { useQuiz } from './quiz';
import type { BankData, Question } from '../types';

/**
 * 这里验两条线：
 *   1. 选择题出题时选项被打乱、答案同步（页面拿到的 current 就是上桌版）；
 *   2. 简答/论述能打字作答，交卷后按要点自动对照，判得不对还能自己改判且不重复计分。
 */
const SHORT_ANSWER =
  '中国共产党是中国工人阶级的先锋队；同时是中国人民和中华民族的先锋队。';

const BANK: BankData = {
  version: 1,
  meta: { title: '测试题库', total: 3, counters: { single: 1, multi: 1, short: 1 }, keyTotal: 3 },
  topics: [{ id: 'k01', section: '一、示例', title: '示例考点', count: 3 }],
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
    {
      id: 'Q3',
      type: 'short',
      no: 3,
      section: 'short',
      sectionLabel: '简答题',
      stem: '示例简答：党的性质是什么？',
      answer: [SHORT_ANSWER],
      answerText: SHORT_ANSWER,
      selfAssess: true,
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

/** 题库里题型混杂、队列又是随机的，所以要先把 current 走到指定题型 */
function gotoType(...types: Question['type'][]): Question {
  for (let i = 0; i < 12; i += 1) {
    const state = useQuiz.getState();
    if (state.current && types.includes(state.current.type)) return state.current;
    if (!state.session || state.session.index + 1 >= state.session.queue.length) break;
    state.next();
  }
  throw new Error(`队列里没有 ${types.join('/')} 题`);
}

const gotoChoice = () => gotoType('single', 'multi');

beforeEach(() => {
  localStorage.clear();
  useQuiz.getState().clearBank();
  useQuiz.getState().importBankData(JSON.parse(JSON.stringify(BANK)) as BankData);
});

describe('出题时选项打乱', () => {
  it('字母按显示位置从 A 连排，选项原文一个不少', () => {
    useQuiz.getState().start('all');
    const current = gotoChoice();
    expect(current.options?.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    const src = SRC.get(current.id) as Question;
    expect(current.options?.map((o) => o.text).sort()).toEqual(
      (src.options ?? []).map((o) => o.text).sort(),
    );
  });

  it('答案字母跟着正确项走，判分按新字母照样判对', () => {
    for (let round = 0; round < 20; round += 1) {
      useQuiz.getState().start('all');
      const current = gotoChoice();
      const shownRight = (current.answer ?? [])
        .map((k) => current.options?.find((o) => o.key === k)?.text ?? '')
        .sort();
      expect(shownRight).toEqual(correctTexts(current.id));

      for (const letter of current.answer ?? []) useQuiz.getState().togglePick(letter);
      useQuiz.getState().submit();
      expect(useQuiz.getState().lastCorrect).toBe(true);
    }
  });

  it('换一道题会重新打乱（同一题多次出现顺序会变）', () => {
    const seen = new Set<string>();
    for (let round = 0; round < 40; round += 1) {
      useQuiz.getState().start('all');
      const current = gotoChoice();
      seen.add((current.options ?? []).map((o) => o.text).join(''));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('题库原题不被改动：背题稿 / 题库页仍是原顺序、原字母', () => {
    useQuiz.getState().start('all');
    gotoChoice();
    const index = useQuiz.getState().index;
    for (const src of BANK.questions) {
      const stored = index?.questionById.get(src.id);
      expect(stored?.options?.map((o) => o.key)).toEqual(src.options?.map((o) => o.key));
      expect(stored?.answer).toEqual(src.answer);
    }
  });

  it('选了打乱后的错项判错', () => {
    useQuiz.getState().start('all');
    const current = gotoChoice();
    const wrongLetter = (current.options ?? []).map((o) => o.key).find((k) => !(current.answer ?? []).includes(k)) as string;
    useQuiz.getState().togglePick(wrongLetter);
    useQuiz.getState().submit();
    expect(useQuiz.getState().lastCorrect).toBe(false);
  });
});

describe('简答 / 论述打字作答', () => {
  const gotoShort = () => gotoType('short');

  it('写出完整答案：自动判对，匹配度接近满分，记录进本机', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().setEssay(SHORT_ANSWER);
    useQuiz.getState().submit();

    const state = useQuiz.getState();
    expect(state.submitted).toBe(true);
    expect(state.awaitingSelfAssess).toBe(false);
    expect(state.essayVerdict?.correct).toBe(true);
    expect(state.essayVerdict?.score).toBeCloseTo(1, 5);
    expect(state.lastCorrect).toBe(true);
    expect(state.progress.records.Q3?.right).toBe(1);
    expect(state.progress.records.Q3?.wrong).toBe(0);
    expect(state.session?.results.at(-1)?.score).toBeCloseTo(1, 5);
  });

  it('答偏了判错，但仍然给出逐条对照', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().setEssay('今天的天气不错，我打算出去走走');
    useQuiz.getState().submit();

    const state = useQuiz.getState();
    expect(state.lastCorrect).toBe(false);
    expect(state.essayVerdict?.points.length).toBeGreaterThan(0);
    expect(state.essayVerdict?.matched).toBe(0);
    expect(state.progress.records.Q3?.wrong).toBe(1);
  });

  it('改判：回滚上一次记的分，不重复计分', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().setEssay('今天的天气不错，我打算出去走走');
    useQuiz.getState().submit();
    expect(useQuiz.getState().progress.records.Q3).toMatchObject({ right: 0, wrong: 1 });

    useQuiz.getState().reviseEssay(true);
    let state = useQuiz.getState();
    expect(state.lastCorrect).toBe(true);
    expect(state.progress.records.Q3).toMatchObject({ right: 1, wrong: 0 });
    expect(state.session?.results.at(-1)?.correct).toBe(true);

    // 再改回去也一样只记一次
    useQuiz.getState().reviseEssay(false);
    state = useQuiz.getState();
    expect(state.progress.records.Q3).toMatchObject({ right: 0, wrong: 1 });
  });

  it('什么都没写就交卷：不自动判分，走「看答案 + 自评」', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().submit();

    let state = useQuiz.getState();
    expect(state.submitted).toBe(true);
    expect(state.awaitingSelfAssess).toBe(true);
    expect(state.essayVerdict).toBeNull();

    useQuiz.getState().selfAssess(true);
    state = useQuiz.getState();
    expect(state.lastCorrect).toBe(true);
    expect(state.progress.records.Q3?.right).toBe(1);
  });

  it('交卷后输入框锁住，改不动答案', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().setEssay(SHORT_ANSWER);
    useQuiz.getState().submit();
    useQuiz.getState().setEssay('改一下');
    expect(useQuiz.getState().essayInput).toBe(SHORT_ANSWER);
  });

  it('换题时输入与判定一起清空', () => {
    useQuiz.getState().start('all');
    gotoShort();
    useQuiz.getState().setEssay(SHORT_ANSWER);
    useQuiz.getState().submit();
    const state = useQuiz.getState();
    // 队列到头就换一轮，反正要触发 loadCurrent
    if (state.session && state.session.index + 1 < state.session.queue.length) {
      state.next();
      expect(useQuiz.getState().essayInput).toBe('');
      expect(useQuiz.getState().essayVerdict).toBeNull();
    } else {
      state.start('all');
      expect(useQuiz.getState().essayInput).toBe('');
    }
  });
});
