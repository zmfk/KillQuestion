import { describe, expect, it } from 'vitest';
import { parseBankText, toBankQuestions } from './parseBank';
import { parseTopicsText } from './parseTopics';
import { matchTopics, termsOf } from './matchTopics';
import { buildBank } from './buildBank';
import type { Topic } from '../types';

/**
 * 下面这些全是编出来的示例文本，不是任何真实题库的内容——
 * 测试要的是「版式能不能认对」，跟题目本身无关。
 */
const BANK_SAMPLE = [
  '第 1 页 共 3 页',
  '<<<PAGE 1>>>',
  '一、填空题',
  '1．示例概念是指（ ）。',
  '答：示例定义',
  '2．示例流程依次是（ ）、（ ）。',
  '答：第一步；第二步',
  '二、选择题',
  '1．下面哪一个是示例选项？',
  'A．甲 B．乙 C．丙 D．丁',
  '正确答案：B',
  '2．下面哪些属于示例选项？',
  'A.甲 B.乙 C.丙 D.丁',
  '正确答案：AB',
  '3．排版把答案挤到行尾的示例题（ ）正确答案：C',
  '三、简答题',
  '1．示例简答题的问题是什么？',
  '答：示例答案第一点。',
  '示例答案第二点。',
  '<<<PAGE 3>>>',
  '第 3 页 共 3 页',
  '四、论述题',
  '【材料】这是一段编出来的示例材料。',
  '1．结合材料说明示例问题一。',
  '2．结合材料说明示例问题二。',
  '【答案】',
  '1.答：示例回答一。',
  '2.答：示例回答二。',
  '五、附录',
  '这一段不属于任何题型。',
].join('\n');

const TOPICS_SAMPLE = [
  '<<<PAGE 1>>>',
  '一、示例分组',
  '示例概念',
  '1. 示例流程',
  '二、另一组',
  '· 另一个考点',
].join('\n');

describe('parseBankText', () => {
  const result = parseBankText(BANK_SAMPLE);

  it('认出四个小节', () => {
    expect(result.sections).toEqual(['填空题', '选择题', '简答题', '论述题']);
  });

  it('各题型的数量与类型正确', () => {
    expect(result.counters.fill).toBe(2);
    expect(result.counters.single).toBe(2);
    expect(result.counters.multi).toBe(1);
    expect(result.counters.short).toBe(1);
    expect(result.counters.essay).toBe(2);
  });

  it('填空题按「答：」切出答案与空位', () => {
    const q = result.questions[0];
    expect(q.type).toBe('fill');
    expect(q.stem).toBe('示例概念是指（ ）。');
    expect(q.answer).toEqual(['示例定义']);
    expect(q.blanks).toBe(1);
  });

  it('填空题多个空按分号拆开', () => {
    const q = result.questions[1];
    expect(q.answer).toEqual(['第一步', '第二步']);
    expect(q.blanks).toBe(2);
  });

  it('多空答案用顿号/逗号串写时按空数拆开', () => {
    const text = [
      '一、填空题',
      '1．示例多空题依次是（ ）、（ ）。',
      '答：甲、乙',
      '2．示例多空题依次是（ ）、（ ）。',
      '答：丙，丁',
      '3．单空答案里带顿号的题：丙、丁（ ）。',
      '答：丙、丁',
    ].join('\n');
    const parsed = parseBankText(text);
    expect(parsed.questions[0].answer).toEqual(['甲', '乙']);
    expect(parsed.questions[0].answerText).toBe('甲；乙');
    expect(parsed.questions[1].answer).toEqual(['丙', '丁']);
    // 单空题不能因为答案里有顿号就被拆碎
    expect(parsed.questions[2].answer).toEqual(['丙、丁']);
  });

  it('选择题拆出四个选项并识别单选', () => {
    const q = result.questions[2];
    expect(q.type).toBe('single');
    expect(q.options?.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.options?.[1].text).toBe('乙');
    expect(q.answer).toEqual(['B']);
  });

  it('多字母答案识别成多选', () => {
    const q = result.questions[3];
    expect(q.type).toBe('multi');
    expect(q.answer).toEqual(['A', 'B']);
  });

  it('答案被挤到选项行尾也能读到', () => {
    const q = result.questions[4];
    expect(q.type).toBe('single');
    expect(q.answer).toEqual(['C']);
    expect(q.stem).toContain('排版把答案挤到行尾');
  });

  it('多行答案拼回一段', () => {
    const q = result.questions[5];
    expect(q.type).toBe('short');
    expect(q.answerText).toContain('示例答案第二点');
  });

  it('论述题拆出材料与分小问答案', () => {
    const qs = result.questions.slice(6);
    expect(qs).toHaveLength(2);
    expect(qs[0].material).toContain('编出来的示例材料');
    expect(qs[0].answerText).toContain('示例回答一');
    expect(qs[1].answerText).toContain('示例回答二');
  });

  it('页眉页脚不进题干', () => {
    for (const q of result.questions) expect(q.stem).not.toContain('第 1 页');
  });

  it('「五、附录」这样的后续章节不会混进论述题', () => {
    expect(result.questions.some((q) => q.stem.includes('不属于任何题型'))).toBe(false);
  });

  it('给题目补 id 后长成应用认识的形状', () => {
    const questions = toBankQuestions(result.questions);
    expect(questions[0].id).toBe('Q0001');
    expect(questions[0].topicIds).toEqual([]);
    expect(questions.at(-1)?.selfAssess).toBe(true);
  });

  it('不是题库的文本会明确说不像题库', () => {
    const empty = parseBankText('随便一段话\n没有任何小节标题');
    expect(empty.questions).toHaveLength(0);
    expect(empty.warnings[0]).toContain('小节标题');
  });
});

describe('判断题小节', () => {
  const TEXT = [
    '一、判断题',
    '1．示例命题甲成立（ ）。',
    '答：√',
    '2．示例命题乙成立（ ）。',
    '答：×',
    '3．示例命题丙成立（ ）。',
    '答案：正确',
    '4．示例命题丁成立（ ）。',
    '正确答案：错误',
    '二、简答题',
    '1．示例简答题的问题是什么？',
    '答：示例答案。',
  ].join('\n');
  const result = parseBankText(TEXT);

  it('认出判断题小节，后面的简答题不受影响', () => {
    expect(result.sections).toEqual(['判断题', '简答题']);
    expect(result.counters.judge).toBe(4);
    expect(result.counters.short).toBe(1);
  });

  it('答案行认 √ × 正确 错误，统一成「正确 / 错误」', () => {
    const answers = result.questions.filter((q) => q.type === 'judge').map((q) => q.answerText);
    expect(answers).toEqual(['正确', '错误', '正确', '错误']);
    expect(result.questions[0].answer).toEqual(['正确']);
    expect(result.questions[0].section).toBe('judge');
    expect(result.questions[0].sectionLabel).toBe('判断题');
  });

  it('没写答案的判断题留空，交给自评', () => {
    const parsed = parseBankText(['一、判断题', '1．示例命题没有给答案（ ）。'].join('\n'));
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].answer).toEqual([]);
    expect(parsed.questions[0].answerText).toBe('');
  });
});

describe('parseTopicsText', () => {
  const parsed = parseTopicsText(TOPICS_SAMPLE);

  it('分组与条目都读进来', () => {
    expect(parsed.sections).toEqual(['一、示例分组', '二、另一组']);
    expect(parsed.topics.map((t) => t.title)).toEqual(['示例概念', '示例流程', '另一个考点']);
  });

  it('条目带上所属分组与编号', () => {
    expect(parsed.topics[0].id).toBe('k01');
    expect(parsed.topics[0].section).toBe('一、示例分组');
    expect(parsed.topics[2].section).toBe('二、另一组');
  });

  it('空文本会提示', () => {
    expect(parseTopicsText('').warnings.length).toBeGreaterThan(0);
  });
});

describe('matchTopics', () => {
  const topics: Topic[] = [
    { id: 'k01', section: '一、示例分组', title: '示例概念的四个特征', count: 0 },
    { id: 'k02', section: '二、另一组', title: '我国的国体与政体', count: 0 },
  ];

  const questions = [
    {
      id: 'Q1',
      type: 'fill' as const,
      no: 1,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '示例概念的四个特征包括（ ）。',
      answer: ['x'],
      answerText: 'x',
      topicIds: [],
    },
    {
      id: 'Q2',
      type: 'fill' as const,
      no: 2,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '我国的国体是（ ），政体是（ ）。',
      answer: ['y'],
      answerText: 'y',
      topicIds: [],
    },
    {
      id: 'Q3',
      type: 'fill' as const,
      no: 3,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '跟考点完全无关的一句话。',
      answer: ['z'],
      answerText: 'z',
      topicIds: [],
    },
  ];

  it('标题里的长词命中就算重点', () => {
    expect(termsOf(topics[0])).toContain('示例概念');
    const { questions: tagged, report } = matchTopics(questions, topics);
    expect(tagged[0].topicIds).toEqual(['k01']);
    expect(report.tagged).toBe(2);
  });

  it('两个短词同时出现才算命中', () => {
    const { questions: tagged } = matchTopics(questions, topics);
    expect(tagged[1].topicIds).toContain('k02');
  });

  it('对不上的题不会被硬标', () => {
    const { questions: tagged } = matchTopics(questions, topics);
    expect(tagged[2].topicIds).toEqual([]);
  });

  it('考点的题数会按命中结果回填', () => {
    const { topics: counted } = matchTopics(questions, topics);
    expect(counted[0].count).toBe(1);
    expect(counted[1].count).toBe(1);
  });

  it('干扰项里出现的考点词不算命中（只认正确选项）', () => {
    // 经典错挂：问「最大政治优势」，干扰项写「坚持民主集中制」，
    // 若把攻击项也算进语料，这道题会被硬挂到「党内民主」那个考点上。
    const trap = {
      id: 'Q9',
      type: 'single' as const,
      no: 9,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '示例：最大政治优势是（ ）。',
      options: [
        { key: 'A', text: '坚持民主集中制' },
        { key: 'B', text: '另一句话' },
      ],
      answer: ['B'],
      answerText: 'B',
      topicIds: [],
    };
    const judge = {
      id: 'Q10',
      type: 'judge' as const,
      no: 10,
      section: 'judge',
      sectionLabel: '判断题',
      stem: '示例：我国的国体是人民民主专政。',
      answer: ['正确'],
      answerText: '正确',
      topicIds: [],
    };
    const { questions: tagged } = matchTopics([trap, judge], topics);
    expect(tagged[0].topicIds).toEqual([]);
    expect(tagged[1].topicIds).toContain('k02');
  });
});

describe('buildBank', () => {
  it('题库 + 划重点一次做完', () => {
    const { data, report } = buildBank({
      bankText: BANK_SAMPLE,
      topicsText: TOPICS_SAMPLE,
      title: '示例题库',
    });
    expect(data.meta.title).toBe('示例题库');
    expect(data.questions.length).toBe(report.total);
    expect(data.topics).toHaveLength(3);
    expect(report.counters.single).toBe(2);
  });

  it('只给划重点时重标已有题目，不动题目本身', () => {
    const first = buildBank({ bankText: BANK_SAMPLE, title: '示例题库' });
    const again = buildBank({
      existingQuestions: first.data.questions,
      topicsText: TOPICS_SAMPLE,
      title: '示例题库',
    });
    expect(again.data.questions).toHaveLength(first.data.questions.length);
    expect(again.data.topics.length).toBeGreaterThan(0);
  });

  it('拿不到题目就明确报错', () => {
    expect(() => buildBank({ bankText: '这里没有任何小标题' })).toThrow();
  });
});
