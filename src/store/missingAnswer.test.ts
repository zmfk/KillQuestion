import { beforeEach, describe, expect, it } from 'vitest';
import { autoGrade, hasReferenceAnswer } from '../core/grade';
import { validateBank } from '../data/bank';
import { useQuiz } from './quiz';
import type { BankData, Question } from '../types';

/**
 * 「题在、答案空」的题库（AI 转 JSON、OCR、残缺 PDF 都很常见）。
 *
 * 旧行为：填空无答案时一个输入框都不渲染，提交按钮点了没反应，整轮练习卡死在那一题；
 * 选择题 / 填空题无答案会直接判错，把没答案的题永远记进错题池。
 * 现在统一退回「看答案 + 自评」，并且任何题都能跳过。
 */
const RAW_BANK = {
  version: 1,
  questions: [
    {
      id: 'Q1',
      type: 'fill',
      no: 1,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '没有答案的填空（ ）',
      answer: [],
      // 故意不给 blanks：以前这里会算出 0 个输入框
      topicIds: [],
    },
    {
      id: 'Q2',
      type: 'single',
      no: 2,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '有选项、没答案的单选（ ）',
      options: [
        { key: 'A', text: '甲' },
        { key: 'B', text: '乙' },
      ],
      answer: [],
      topicIds: [],
    },
    {
      id: 'Q3',
      type: 'single',
      no: 3,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '连选项都没解析出来的单选题（ ）',
      topicIds: [],
    },
    {
      id: 'Q4',
      type: 'judge',
      no: 4,
      section: 'judge',
      sectionLabel: '判断题',
      stem: '没有答案的判断题。',
      answer: [],
      topicIds: [],
    },
    {
      id: 'Q5',
      type: 'short',
      no: 5,
      section: 'short',
      sectionLabel: '简答题',
      stem: '没有答案的简答题？',
      answer: [],
      topicIds: [],
    },
    {
      id: 'Q6',
      type: 'fill',
      no: 6,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '答案串写成了字符串（ ）',
      answer: '示例答案',
      topicIds: [],
    },
  ],
} as unknown as BankData;

function importMissingBank(): BankData {
  const parsed = validateBank(JSON.parse(JSON.stringify(RAW_BANK)));
  useQuiz.getState().importBankData(parsed);
  return parsed;
}

/** 从顺序队列里走到指定题（start 用例集中各写一次，避免共享可变状态） */
function goto(id: string): Question {
  useQuiz.getState().start('all', { ordered: true });
  for (let i = 0; i < 10; i += 1) {
    const state = useQuiz.getState();
    if (state.current?.id === id) return state.current;
    state.next();
  }
  throw new Error(`队列里没有 ${id}`);
}

beforeEach(() => {
  localStorage.clear();
  useQuiz.getState().clearBank();
  importMissingBank();
});

describe('导入时把缺答案的题规范化', () => {
  it('字符串答案变成数组，缺答案变成空数组', () => {
    const index = useQuiz.getState().index;
    expect(index?.questionById.get('Q6')?.answer).toEqual(['示例答案']);
    expect(index?.questionById.get('Q1')?.answer).toEqual([]);
  });

  it('填空题至少留一个空位，选择题至少有一份空 options', () => {
    const index = useQuiz.getState().index;
    expect(index?.questionById.get('Q1')?.blanks).toBe(1);
    expect(index?.questionById.get('Q2')?.options).toHaveLength(2);
    expect(index?.questionById.get('Q3')?.options).toEqual([]);
  });

  it('answerText 缺失时用 answer 拼一份，判断题答案照旧归一化', () => {
    const index = useQuiz.getState().index;
    expect(index?.questionById.get('Q6')?.answerText).toBe('示例答案');
    expect(index?.questionById.get('Q1')?.answerText).toBe('');
  });
});

describe('判分不再把没答案的题判错', () => {
  const q = (id: string) => useQuiz.getState().index?.questionById.get(id) as Question;

  it('hasReferenceAnswer 认出哪些题没答案', () => {
    expect(hasReferenceAnswer(q('Q1'))).toBe(false);
    expect(hasReferenceAnswer(q('Q2'))).toBe(false);
    expect(hasReferenceAnswer(q('Q4'))).toBe(false);
    expect(hasReferenceAnswer(q('Q5'))).toBe(false);
    expect(hasReferenceAnswer(q('Q6'))).toBe(true);
  });

  it('选择题 / 填空题没答案时 autoGrade 返回 null（自评）', () => {
    expect(autoGrade(q('Q1'), ['随便写'])).toBeNull();
    expect(autoGrade(q('Q2'), ['A'])).toBeNull();
    expect(autoGrade(q('Q6'), ['示例答案'])).toBe(true);
  });
});

describe('答题页不会卡死', () => {
  it('填空无答案：仍然渲染输入框，提交后进入自评而不是被拦住', () => {
    goto('Q1');
    expect(useQuiz.getState().fillInputs).toHaveLength(1);

    useQuiz.getState().setFill(0, '随便填');
    useQuiz.getState().submit();
    const after = useQuiz.getState();
    expect(after.submitted).toBe(true);
    expect(after.awaitingSelfAssess).toBe(true);
    expect(after.lastCorrect).toBeNull();
  });

  it('填空无答案：一个字都不写也能交卷自评', () => {
    goto('Q1');
    useQuiz.getState().submit();
    expect(useQuiz.getState().awaitingSelfAssess).toBe(true);
  });

  it('无答案的题提交后不记错题（作答记录里没有它）', () => {
    goto('Q1');
    useQuiz.getState().submit();
    expect(useQuiz.getState().progress.records.Q1).toBeUndefined();
  });

  it('有选项但没答案的单选：选一项提交后走自评，不判错', () => {
    goto('Q2');
    useQuiz.getState().togglePick('A');
    useQuiz.getState().submit();
    const after = useQuiz.getState();
    expect(after.awaitingSelfAssess).toBe(true);
    expect(after.progress.records.Q2).toBeUndefined();
  });

  it('连选项都没有的单选：不选也能提交（页面上本来就没有可点的地方）', () => {
    goto('Q3');
    expect(useQuiz.getState().current?.options ?? []).toHaveLength(0);
    useQuiz.getState().submit();
    expect(useQuiz.getState().awaitingSelfAssess).toBe(true);
  });

  it('自评后照常进入下一题', () => {
    goto('Q1');
    useQuiz.getState().submit();
    useQuiz.getState().selfAssess(true);
    const before = useQuiz.getState().session?.index ?? -1;
    useQuiz.getState().next();
    expect(useQuiz.getState().session?.index).toBe(before + 1);
    expect(useQuiz.getState().current?.id).toBe('Q2');
  });

  it('跳过这题：不记作答也能翻页，题还留在「未完成」里', () => {
    goto('Q1');
    useQuiz.getState().next();
    expect(useQuiz.getState().current?.id).toBe('Q2');
    expect(useQuiz.getState().progress.records.Q1).toBeUndefined();
  });
});

describe('换题库后旧会话不会卡在找不到的题上', () => {
  const smaller = {
    version: 1,
    questions: [
      {
        id: 'Q2',
        type: 'single',
        no: 1,
        section: 'choice',
        sectionLabel: '选择题',
        stem: '留下的单选题（ ）',
        options: [
          { key: 'A', text: '甲' },
          { key: 'B', text: '乙' },
        ],
        answer: ['A'],
        topicIds: [],
      },
      {
        id: 'Q5',
        type: 'short',
        no: 2,
        section: 'short',
        sectionLabel: '简答题',
        stem: '留下的简答题？',
        answer: ['参考答案'],
        answerText: '参考答案',
        topicIds: [],
      },
    ],
  };

  it('旧队列里不存在的题 id 被剔掉，进度按剩余题重算，current 不为空', () => {
    useQuiz.getState().start('all', { ordered: true });
    useQuiz.getState().next();
    expect(useQuiz.getState().session?.index).toBe(1);
    expect(useQuiz.getState().current?.id).toBe('Q2');

    // 换一份只含 Q2 / Q5 的题库，保留进度（这才可能带着旧会话）
    useQuiz.getState().importBankData(validateBank(smaller), { keepProgress: true });

    const state = useQuiz.getState();
    expect(state.session?.queue).toEqual(['Q2', 'Q5']);
    expect(state.session?.index).toBe(0);
    expect(state.current?.id).toBe('Q2');
  });

  it('旧队列里一道都没留下时会话直接作废，不留下「接着刷」的死入口', () => {
    useQuiz.getState().start('all', { ordered: true });
    useQuiz.getState().next();

    useQuiz.getState().importBankData(
      validateBank({
        version: 1,
        questions: [
          {
            id: 'QQ',
            type: 'short',
            no: 1,
            section: 'short',
            sectionLabel: '简答题',
            stem: '完全不同的题？',
            answer: ['答案'],
            answerText: '答案',
            topicIds: [],
          },
        ],
      }),
      { keepProgress: true },
    );

    expect(useQuiz.getState().session).toBeNull();
    expect(useQuiz.getState().current).toBeNull();
  });
});
