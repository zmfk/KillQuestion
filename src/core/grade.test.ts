import { describe, expect, it } from 'vitest';
import {
  autoGrade,
  gradeBlank,
  gradeChoice,
  gradeFill,
  gradeJudge,
  normalizeFill,
  normalizeJudge,
  splitAccepts,
} from './grade';

describe('gradeChoice', () => {
  it('集合相等即对，与顺序无关', () => {
    expect(gradeChoice(['A', 'C'], ['C', 'A'])).toBe(true);
  });
  it('漏选算错', () => {
    expect(gradeChoice(['A', 'C'], ['A'])).toBe(false);
  });
  it('多选算错', () => {
    expect(gradeChoice(['A'], ['A', 'B'])).toBe(false);
  });
  it('空选算错', () => {
    expect(gradeChoice(['A'], [])).toBe(false);
  });
});

describe('normalizeFill', () => {
  it('全角转半角、去空白、去标点', () => {
    expect(normalizeFill('  全心全意为人民服务。 ')).toBe('全心全意为人民服务');
    expect(normalizeFill('ＡＢＣ')).toBe('abc');
  });
  it('幂等', () => {
    const once = normalizeFill('社会主义 道路、');
    expect(normalizeFill(once)).toBe(once);
  });
});

describe('gradeBlank', () => {
  it('完全一致', () => {
    expect(gradeBlank(['实现共产主义'], '实现共产主义')).toBe(true);
  });
  it('容忍句末标点与空白', () => {
    expect(gradeBlank(['实现共产主义'], '实现共产主义。')).toBe(true);
    expect(gradeBlank(['实现共产主义'], '实现 共产主义')).toBe(true);
  });
  it('空输入算错', () => {
    expect(gradeBlank(['实现共产主义'], '   ')).toBe(false);
  });
  it('多个可接受写法任一命中', () => {
    expect(gradeBlank(['鲁迅', '周树人'], '周树人')).toBe(true);
  });
});

describe('splitAccepts', () => {
  it('按分隔符拆开', () => {
    expect(splitAccepts('发展；生产力')).toEqual(['发展', '生产力']);
  });
});

describe('gradeFill', () => {
  const q = {
    id: 't',
    type: 'fill' as const,
    no: 1,
    section: 'fill',
    sectionLabel: '填空题',
    stem: '（）、（）',
    answer: ['理论联系实际', '实事求是'],
    topicIds: [],
  };
  it('两空全对', () => {
    expect(gradeFill(q, ['理论联系实际', '实事求是'])).toBe(true);
  });
  it('错一个就是错', () => {
    expect(gradeFill(q, ['理论联系实际', '与时俱进'])).toBe(false);
  });
  it('漏答算错', () => {
    expect(gradeFill(q, ['理论联系实际'])).toBe(false);
  });
});

describe('判断题', () => {
  const judge = (answer: string) => ({
    id: 'j',
    type: 'judge' as const,
    no: 1,
    section: 'judge',
    sectionLabel: '判断题',
    stem: '示例命题。',
    answer: [answer],
    topicIds: [],
  });

  it('各种写法归一化到「正确 / 错误」', () => {
    for (const v of ['正确', '对', '√', '✓', 'T', '是']) expect(normalizeJudge(v)).toBe('正确');
    for (const v of ['错误', '错', '×', '✗', 'F', '否']) expect(normalizeJudge(v)).toBe('错误');
    expect(normalizeJudge('说不清')).toBeNull();
    expect(normalizeJudge('   ')).toBeNull();
  });

  it('选对得分，选错不得分', () => {
    expect(gradeJudge(judge('正确'), ['正确'])).toBe(true);
    expect(gradeJudge(judge('正确'), ['错误'])).toBe(false);
    expect(gradeJudge(judge('错误'), ['×'])).toBe(true);
  });

  it('没作答算错', () => {
    expect(gradeJudge(judge('正确'), [])).toBe(false);
  });

  it('题干没给答案时退回自评（null），不是直接判错', () => {
    expect(autoGrade(judge(''), ['正确'])).toBeNull();
    expect(autoGrade(judge('正确'), ['正确'])).toBe(true);
  });
});
