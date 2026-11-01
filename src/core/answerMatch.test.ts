import { describe, expect, it } from 'vitest';
import {
  ESSAY_PASS_RATIO,
  gradeEssayAnswer,
  keyGrams,
  normalizeAnswerText,
  splitAnswerPoints,
} from './answerMatch';
import type { Question } from '../types';

/**
 * 简答/论述的测试数据全是编的示例文本，验的是「怎么拆要点、怎么算覆盖、阈值怎么生效」，
 * 与任何真实题目无关。
 */
function q(partial: Partial<Question> & Pick<Question, 'answerText'>): Question {
  return {
    id: 'Q1',
    type: 'short',
    no: 1,
    section: 'short',
    sectionLabel: '简答题',
    stem: '示例题（）',
    topicIds: [],
    ...partial,
  };
}

describe('normalizeAnswerText', () => {
  it('全角转半角、去标点空白、小写', () => {
    expect(normalizeAnswerText(' 中国共产党（CPC）、１９２１ 年 ')).toBe('中国共产党cpc1921年');
  });
});

describe('keyGrams', () => {
  it('中文取 2 字滑窗', () => {
    expect(keyGrams('中国')).toEqual(['中国']);
    expect(keyGrams('人民民主')).toEqual(['人民', '民民', '民主']);
  });

  it('整串都是虚字组合的被丢掉，不给匹配灌水', () => {
    expect(keyGrams('的是')).toEqual([]);
    expect(keyGrams('和的')).toEqual([]);
    // 有实字的照样留
    expect(keyGrams('的是人')).toContain('是人');
  });

  it('单字保留、空串为空', () => {
    expect(keyGrams('党')).toEqual(['党']);
    expect(keyGrams('   ')).toEqual([]);
  });
});

describe('splitAnswerPoints', () => {
  it('（一）（二）分点', () => {
    const points = splitAnswerPoints(
      '（一）参加党的有关会议，阅读党的有关文件。（二）参加关于党的政策问题的讨论。',
    );
    expect(points).toEqual([
      '参加党的有关会议，阅读党的有关文件',
      '参加关于党的政策问题的讨论',
    ]);
  });

  it('①②分点', () => {
    const points = splitAnswerPoints('①树立远大理想②热爱伟大祖国③担当时代责任');
    expect(points).toEqual(['树立远大理想', '热爱伟大祖国', '担当时代责任']);
  });

  it('行首序号分点', () => {
    const points = splitAnswerPoints('1. 第一个要点写在这里。2. 第二个要点写在这里。');
    expect(points).toEqual(['第一个要点写在这里', '第二个要点写在这里']);
  });

  it('没有分点标记就按句子拆', () => {
    const points = splitAnswerPoints('这句是第一个要点。这句是第二个要点；这句是第三个要点。');
    expect(points).toEqual(['这句是第一个要点', '这句是第二个要点', '这句是第三个要点']);
  });

  it('太短的残句并进上一句，不单独拉低匹配度', () => {
    const points = splitAnswerPoints('坚持党的领导是根本保证。言之有理。');
    expect(points).toEqual(['坚持党的领导是根本保证；言之有理']);
  });

  it('空答案返回空数组', () => {
    expect(splitAnswerPoints('   ')).toEqual([]);
  });
});

describe('gradeEssayAnswer', () => {
  const ANSWER =
    '中国共产党是中国工人阶级的先锋队；同时是中国人民和中华民族的先锋队；是中国特色社会主义事业的领导核心。';
  const question = q({ answerText: ANSWER });

  it('没写东西 / 少于两个字返回 null（交给自评，不硬判错）', () => {
    expect(gradeEssayAnswer(question, '')).toBeNull();
    expect(gradeEssayAnswer(question, '  ')).toBeNull();
    expect(gradeEssayAnswer(question, '党')).toBeNull();
  });

  it('题库没给参考答案时返回 null', () => {
    expect(gradeEssayAnswer(q({ answerText: '' }), '随便写点什么内容')).toBeNull();
  });

  it('照抄参考答案判对，且逐条要点都算答到', () => {
    const verdict = gradeEssayAnswer(question, ANSWER);
    expect(verdict).not.toBeNull();
    expect(verdict?.score).toBeCloseTo(1, 5);
    expect(verdict?.correct).toBe(true);
    expect(verdict?.points.every((p) => p.covered)).toBe(true);
    expect(verdict?.matched).toBe(verdict?.total);
  });

  it('写全了但用自己组织的句子，仍能拿到高分', () => {
    const verdict = gradeEssayAnswer(
      question,
      '中国共产党是中国工人阶级的先锋队，也是中国人民和中华民族的先锋队，是中国特色社会主义事业的领导核心。',
    );
    expect(verdict?.score).toBeGreaterThanOrEqual(ESSAY_PASS_RATIO);
    expect(verdict?.correct).toBe(true);
  });

  it('只答到一条要点时低于阈值，判错但给出明细', () => {
    const verdict = gradeEssayAnswer(question, '中国共产党是工人阶级先锋队');
    expect(verdict?.correct).toBe(false);
    expect(verdict?.score).toBeLessThan(ESSAY_PASS_RATIO);
    expect(verdict?.matched).toBeGreaterThan(0);
    expect(verdict?.points.some((p) => !p.covered)).toBe(true);
  });

  it('完全跑题判错', () => {
    const verdict = gradeEssayAnswer(question, '今天天气不错我想去公园散步');
    expect(verdict?.correct).toBe(false);
    expect(verdict?.score).toBeLessThan(0.15);
    expect(verdict?.matched).toBe(0);
  });

  it('重复关键词刷不来分（按集合算，不是按次数）', () => {
    const once = gradeEssayAnswer(question, '先锋队');
    const many = gradeEssayAnswer(question, '先锋队 先锋队 先锋队 先锋队 先锋队');
    expect(once?.score).toBe(many?.score);
  });

  it('同义改写算不中：这是词面匹配的已知局限，行为固定下来免得误判成「能理解」', () => {
    const verdict = gradeEssayAnswer(question, '无产阶级的先锋队');
    // 「无产阶级」与标准答案的「工人阶级」不是同一串字符，只能靠「先锋队」蹭一点分
    expect(verdict?.correct).toBe(false);
  });

  it('要点数与阈值一并返回，页面照它显示', () => {
    const verdict = gradeEssayAnswer(question, ANSWER);
    expect(verdict?.passRatio).toBe(ESSAY_PASS_RATIO);
    expect(verdict?.total).toBe(3);
    expect(verdict?.points.map((p) => p.text)).toEqual([
      '中国共产党是中国工人阶级的先锋队',
      '同时是中国人民和中华民族的先锋队',
      '是中国特色社会主义事业的领导核心',
    ]);
  });
});
