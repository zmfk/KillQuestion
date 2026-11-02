import { beforeEach, describe, expect, it } from 'vitest';
import { emptyPlan } from '../core/examPlan';
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
  meta: { title: '测试题库', total: 3, counters: { single: 1, multi: 1, short: 1 }, keyTotal: 2 },
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
      // 故意不挂考点：用来区分「全量未完成」与「重点未完成」两个池子
      topicIds: [],
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

/** 把当前这道题答掉（对错不论），用来推进「未完成」池 */
function answerCurrent(): boolean {
  const s = useQuiz.getState();
  const q = s.current;
  if (!q) return false;
  if (q.type === 'single' || q.type === 'multi' || q.type === 'judge') {
    for (const key of q.answer ?? []) s.togglePick(key);
  } else if (q.type === 'fill') {
    (q.answer ?? []).forEach((answer, i) => s.setFill(i, answer.split(/[；;|/]/)[0] ?? ''));
  } else {
    useQuiz.getState().setEssay(q.answerText ?? SHORT_ANSWER);
  }
  useQuiz.getState().submit();
  return useQuiz.getState().submitted;
}

describe('未完成题练习', () => {
  const queueOf = () => useQuiz.getState().session?.queue ?? [];

  it('全量未完成：没答过的题全在池子里', () => {
    expect(useQuiz.getState().start('todo')).toBe(true);
    expect(new Set(queueOf())).toEqual(new Set(['Q1', 'Q2', 'Q3']));
  });

  it('重点未完成：只有挂考点的题，非重点题不进池', () => {
    expect(useQuiz.getState().start('todoKey')).toBe(true);
    const queue = queueOf();
    expect(new Set(queue)).toEqual(new Set(['Q1', 'Q3']));
    expect(queue).not.toContain('Q2');
  });

  it('答过一题之后，那道题不再出现在未完成池里', () => {
    useQuiz.getState().start('todo');
    const answeredId = gotoType('single').id;
    answerCurrent();
    expect(useQuiz.getState().progress.records[answeredId]).toBeDefined();

    useQuiz.getState().start('todo');
    expect(queueOf()).not.toContain(answeredId);
    expect(queueOf()).toHaveLength(2);

    useQuiz.getState().start('todoKey');
    expect(queueOf()).not.toContain(answeredId);
    expect(queueOf()).toHaveLength(1);
  });

  it('做错的题仍算完成（要重刷走错题模式，不是「未完成」）', () => {
    useQuiz.getState().start('todo');
    const q = gotoType('single', 'multi');
    // 故意选一个错项
    const wrong = (q.options ?? []).map((o) => o.key).find((k) => !(q.answer ?? []).includes(k));
    if (wrong) useQuiz.getState().togglePick(wrong);
    useQuiz.getState().submit();
    expect(useQuiz.getState().lastCorrect).toBe(false);

    useQuiz.getState().start('todo');
    expect(queueOf()).not.toContain(q.id);
    // 但它在错题池里
    useQuiz.getState().start('wrong');
    expect(queueOf()).toContain(q.id);
  });

  it('全部练完之后两池都空，start 返回 false（按钮变灰）', () => {
    for (let i = 0; i < 10; i += 1) {
      if (!useQuiz.getState().start('todo')) break;
      expect(answerCurrent()).toBe(true);
    }
    expect(useQuiz.getState().start('todo')).toBe(false);
    expect(useQuiz.getState().start('todoKey')).toBe(false);
    expect(Object.keys(useQuiz.getState().progress.records)).toHaveLength(3);
  });
});

describe('考试卷（全题 / 重点）', () => {
  const sessionOf = () => useQuiz.getState().session!;

  it('全题考试：按卷面配比从整本题库抽，题型顺序排好，带 60 分钟倒计时', () => {
    expect(useQuiz.getState().start('exam')).toBe(true);
    const s = sessionOf();
    expect(s.label).toBe('全题考试');
    // 题库里每种题型各一道，配比份额大于库存时按实际数量出
    expect(s.queue).toEqual(['Q1', 'Q2', 'Q3']);
    expect(Math.round(((s.endsAt ?? 0) - s.startedAt) / 60_000)).toBe(60);
  });

  it('重点考试：同一套配比，但只在划重点的题里抽，非重点题不进卷', () => {
    expect(useQuiz.getState().start('examKey')).toBe(true);
    const s = sessionOf();
    expect(s.label).toBe('重点考试');
    expect(s.queue).toEqual(['Q1', 'Q3']);
    expect(s.queue).not.toContain('Q2');
    expect(Math.round(((s.endsAt ?? 0) - s.startedAt) / 60_000)).toBe(60);
  });

  it('非考试模式没有倒计时', () => {
    useQuiz.getState().start('all');
    expect(sessionOf().endsAt).toBeNull();
  });
});

describe('考试配比可调', () => {
  const sessionOf = () => useQuiz.getState().session!;

  it('按填的题型数量组卷，填 0 的题型一道不出', () => {
    expect(
      useQuiz.getState().start('exam', {
        plan: { fill: 0, single: 1, multi: 0, judge: 0, short: 0, essay: 0 },
      }),
    ).toBe(true);
    expect(sessionOf().queue).toEqual(['Q1']);
    expect(sessionOf().plan).toEqual({ fill: 0, single: 1, multi: 0, judge: 0, short: 0, essay: 0 });
  });

  it('填得比库存多只出库存那么多', () => {
    expect(
      useQuiz.getState().start('exam', {
        plan: { fill: 99, single: 99, multi: 99, judge: 99, short: 99, essay: 99 },
      }),
    ).toBe(true);
    // 题库只有 3 道题，配比要得再多也抽不出多余的题
    expect(sessionOf().queue).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('全填 0 就开不了考，不会跳进空练习', () => {
    expect(useQuiz.getState().start('exam', { plan: emptyPlan() })).toBe(false);
    expect(useQuiz.getState().session).toBeNull();
  });

  it('重点考试同样按配比出卷，非重点题照样被拦在外面', () => {
    expect(
      useQuiz.getState().start('examKey', {
        plan: { fill: 0, single: 1, multi: 1, judge: 0, short: 1, essay: 0 },
      }),
    ).toBe(true);
    expect(sessionOf().queue).toEqual(['Q1', 'Q3']);
  });

  it('配比存在本机，下次开考直接沿用', () => {
    useQuiz.getState().setExamPlan({ fill: 0, single: 1, multi: 0, judge: 0, short: 1, essay: 0 });
    expect(useQuiz.getState().examPlan).toMatchObject({ short: 1 });
    expect(JSON.parse(localStorage.getItem('killquestion.examplan.v1') ?? 'null')).toMatchObject({
      short: 1,
    });

    useQuiz.getState().start('exam');
    expect(sessionOf().plan).toEqual({ fill: 0, single: 1, multi: 0, judge: 0, short: 1, essay: 0 });
    expect(sessionOf().queue).toEqual(['Q1', 'Q3']);
  });

  it('非考试模式不看配比，也不会在会话里记配比', () => {
    expect(useQuiz.getState().start('all', { plan: emptyPlan() })).toBe(true);
    expect(useQuiz.getState().session?.queue).toHaveLength(3);
    expect(useQuiz.getState().session?.plan).toBeUndefined();
  });
});

/** 把当前这道选择题故意答错，返回题目 id */
function missChoice(type: Question['type']): string {
  const state = useQuiz.getState();
  const q = gotoType(type);
  const wrongKey = (q.options ?? []).map((o) => o.key).find((k) => !(q.answer ?? []).includes(k));
  if (!wrongKey) throw new Error('这道题找不到错项');
  state.togglePick(wrongKey);
  state.submit();
  expect(useQuiz.getState().lastCorrect).toBe(false);
  return q.id;
}

describe('错题重刷（全部 / 重点）', () => {
  const queueOf = () => useQuiz.getState().session?.queue ?? [];

  it('全部错题 = 所有做错的题；重点错题 = 其中划了重点的那些', () => {
    useQuiz.getState().start('all');
    missChoice('single'); // Q1，挂了考点
    useQuiz.getState().start('all');
    missChoice('multi'); // Q2，没挂考点

    useQuiz.getState().start('wrong');
    expect(useQuiz.getState().session?.label).toBe('错题重刷 · 全部');
    expect(new Set(queueOf())).toEqual(new Set(['Q1', 'Q2']));

    expect(useQuiz.getState().start('wrongKey')).toBe(true);
    expect(useQuiz.getState().session?.label).toBe('错题重刷 · 重点');
    expect(new Set(queueOf())).toEqual(new Set(['Q1']));
    expect(queueOf()).not.toContain('Q2');
  });

  it('重刷到「做对多于做错」就从池子里退出，重点池空了按钮变灰', () => {
    useQuiz.getState().start('all');
    missChoice('single');
    useQuiz.getState().start('all');
    missChoice('multi');

    // 把 Q1 连答对两次：right=2 > wrong=1
    for (let i = 0; i < 2; i += 1) {
      useQuiz.getState().start('key');
      const q = gotoType('single');
      expect(q.id).toBe('Q1');
      for (const key of q.answer ?? []) useQuiz.getState().togglePick(key);
      useQuiz.getState().submit();
      expect(useQuiz.getState().lastCorrect).toBe(true);
    }

    useQuiz.getState().start('wrong');
    expect(queueOf()).not.toContain('Q1');
    expect(queueOf()).toEqual(['Q2']);

    expect(useQuiz.getState().start('wrongKey')).toBe(false);
    expect(useQuiz.getState().progress.records.Q1).toMatchObject({ right: 2, wrong: 1 });
  });
});

describe('备份导出与恢复', () => {
  /** 答一道选择题，返回它的 id */
  function answerOneChoice(): string {
    useQuiz.getState().start('all');
    const q = gotoType('single', 'multi');
    for (const key of q.answer ?? []) useQuiz.getState().togglePick(key);
    useQuiz.getState().submit();
    return q.id;
  }

  it('导出的备份能整包恢复到「另一台设备」：题库 + 记录 + 收藏 + 进行中的一轮', () => {
    const id = answerOneChoice();
    useQuiz.getState().toggleStar(id);
    const text = useQuiz.getState().exportBackupText({ includeBank: true });
    const before = useQuiz.getState().progress;

    // 模拟换设备：题库与进度一起清掉
    useQuiz.getState().clearBank();
    expect(useQuiz.getState().index).toBeNull();

    const summary = useQuiz.getState().importBackup(text, { mode: 'replace' });
    const state = useQuiz.getState();

    expect(summary.bankImported).toBe(true);
    expect(summary.questionCount).toBe(3);
    expect(state.index?.questions).toHaveLength(3);
    expect(state.progress.records[id]).toEqual(before.records[id]);
    expect(state.progress.stars).toEqual([id]);
    expect(state.progress.finishedSessions).toBe(before.finishedSessions);
    // 备份里带着没刷完的那一轮，恢复后能接着刷
    expect(state.session).not.toBeNull();
    expect(state.current?.id).toBe(state.session?.queue[state.session.index]);
  });

  it('只导答题情况（不含题库）也能恢复，本机仍没有题库', () => {
    const id = answerOneChoice();
    const text = useQuiz.getState().exportBackupText({ includeBank: false });
    useQuiz.getState().clearBank();

    const summary = useQuiz.getState().importBackup(text, { mode: 'replace' });
    const state = useQuiz.getState();
    expect(summary.bankImported).toBe(false);
    expect(state.index).toBeNull();
    expect(state.progress.records[id]).toBeDefined();
    // 没题库就出不了题，但记录照样在，等题库导进来就能对上
    expect(state.current).toBeNull();
  });

  it('合并模式：同一题的次数相加，收藏取并集', () => {
    const id = answerOneChoice();
    const local = useQuiz.getState().progress.records[id];
    const incoming = {
      app: 'killquestion',
      kind: 'backup',
      version: 1,
      progress: {
        records: { [id]: { right: 5, wrong: 2, lastAt: 1 }, Q_不在题库: { right: 1, wrong: 0, lastAt: 2 } },
        stars: ['Q_收藏'],
        session: null,
        finishedSessions: 3,
        lastStudyAt: 9,
      },
    };
    const summary = useQuiz.getState().importBackup(JSON.stringify(incoming), { mode: 'merge' });
    const state = useQuiz.getState();

    expect(summary.mode).toBe('merge');
    expect(state.progress.records[id]).toEqual({
      right: local!.right + 5,
      wrong: local!.wrong + 2,
      lastAt: Math.max(local!.lastAt, 1),
    });
    expect(state.progress.finishedSessions).toBe(3);
    expect(state.progress.stars).toContain('Q_收藏');
    expect(summary.records).toBeGreaterThanOrEqual(2);
  });

  it('覆盖模式：本机多出来的记录被丢掉，完全以备份为准', () => {
    const id = answerOneChoice();
    const incoming = {
      app: 'killquestion',
      kind: 'backup',
      version: 1,
      progress: {
        records: { 只这一题: { right: 1, wrong: 0, lastAt: 5 } },
        stars: [],
        session: null,
        finishedSessions: 1,
        lastStudyAt: 5,
      },
    };
    useQuiz.getState().importBackup(JSON.stringify(incoming), { mode: 'replace' });
    const state = useQuiz.getState();
    expect(state.progress.records[id]).toBeUndefined();
    expect(Object.keys(state.progress.records)).toEqual(['只这一题']);
    expect(state.progress.finishedSessions).toBe(1);
  });

  it('坏文件报错，且不破坏已有数据', () => {
    const id = answerOneChoice();
    const before = useQuiz.getState().progress;

    expect(() => useQuiz.getState().importBackup('这不是 JSON')).toThrow(/不是 JSON/);
    expect(() => useQuiz.getState().importBackup(JSON.stringify({ app: '别的应用' }))).toThrow();
    expect(useQuiz.getState().progress).toEqual(before);
    expect(useQuiz.getState().progress.records[id]).toBeDefined();
  });

  it('备份里题库结构不对时报错，进度不被改掉', () => {
    const id = answerOneChoice();
    const before = useQuiz.getState().progress;
    const bad = {
      app: 'killquestion',
      kind: 'backup',
      version: 1,
      progress: { records: { Q1: { right: 9, wrong: 0, lastAt: 1 } }, stars: [] },
      bank: { questions: [{ id: 'Q1', type: '不认识的题型' }] },
    };
    expect(() => useQuiz.getState().importBackup(JSON.stringify(bad), { mode: 'replace' })).toThrow(
      /题型不认识/,
    );
    expect(useQuiz.getState().progress).toEqual(before);
    expect(useQuiz.getState().progress.records[id]).toBeDefined();
  });
});
