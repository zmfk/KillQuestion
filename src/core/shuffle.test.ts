import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { gradeChoice } from './grade';
import {
  hasPositionalOption,
  optionLetters,
  shuffle,
  shuffleChoiceOptions,
  shuffleOptions,
} from './shuffle';
import type { Option } from '../types';

/** 测试用的假选项：字母照题库习惯写 A、B、C、D，文字只用来认位置 */
const ABCD: Option[] = [
  { key: 'A', text: '甲' },
  { key: 'B', text: '乙' },
  { key: 'C', text: '丙' },
  { key: 'D', text: '丁' },
];

describe('shuffle', () => {
  it('是排列：元素不增不减、不重复', () => {
    const rng = mulberry32(7);
    for (let round = 0; round < 20; round += 1) {
      const out = shuffle([0, 1, 2, 3, 4, 5, 6], rng);
      expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('同种子同序列，且不碰入参', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const a = shuffle(src, mulberry32(42));
    const b = shuffle(src, mulberry32(42));
    expect(a).toEqual(b);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('空数组与单元组不出错', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['x'], mulberry32(1))).toEqual(['x']);
  });
});

describe('optionLetters', () => {
  it('按数量现算字母', () => {
    expect(optionLetters(4)).toEqual(['A', 'B', 'C', 'D']);
    expect(optionLetters(0)).toEqual([]);
    expect(optionLetters(2.9)).toEqual(['A', 'B']);
    expect(optionLetters(30)).toHaveLength(26);
    expect(optionLetters(Number.NaN)).toEqual([]);
  });
});

describe('shuffleChoiceOptions', () => {
  it('字母永远按显示位置从 A 连排', () => {
    const rng = mulberry32(3);
    for (let round = 0; round < 30; round += 1) {
      const { options } = shuffleChoiceOptions(ABCD, ['A'], rng);
      expect(options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
      // 文字集合不变，只是顺序可能不同
      expect(options.map((o) => o.text).sort()).toEqual(['丁', '丙', '乙', '甲']);
    }
  });

  it('答案跟着正确项走：显示字母指向的永远是同一段选项文字', () => {
    const rng = mulberry32(11);
    for (let round = 0; round < 50; round += 1) {
      const { options, answer } = shuffleChoiceOptions(ABCD, ['A', 'D'], rng);
      const texts = answer.map((k) => options.find((o) => o.key === k)?.text);
      expect(texts.sort()).toEqual(['丁', '甲']);
    }
  });

  it('新字母判分与题库原答案等价', () => {
    const rng = mulberry32(99);
    for (let round = 0; round < 50; round += 1) {
      const { options, answer } = shuffleChoiceOptions(ABCD, ['B', 'C'], rng);
      // 用新字母选对：判对
      expect(gradeChoice(answer, answer)).toBe(true);
      // 用新字母选错（换掉一个）：判错
      const wrong = [answer[0], options.map((o) => o.key).find((k) => !answer.includes(k)) as string];
      expect(gradeChoice(answer, wrong)).toBe(false);
      // 多选题漏选判错
      expect(gradeChoice(answer, [answer[0]])).toBe(false);
    }
  });

  it('多次出题会换位置（不是每次都原样）', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const { options } = shuffleChoiceOptions(ABCD, ['A'], mulberry32(i * 2654435761));
      orders.add(options.map((o) => o.text).join(''));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('位置相关选项整题锁定原顺序（「以上都对」不能乱换）', () => {
    const positional: Option[] = [
      { key: 'A', text: '前者' },
      { key: 'B', text: '后者' },
      { key: 'C', text: '以上都对' },
    ];
    expect(hasPositionalOption(positional)).toBe(true);
    const rng = mulberry32(5);
    for (let round = 0; round < 20; round += 1) {
      const { options, answer, shuffled } = shuffleChoiceOptions(positional, ['C'], rng);
      expect(options.map((o) => o.text)).toEqual(['前者', '后者', '以上都对']);
      expect(options.map((o) => o.key)).toEqual(['A', 'B', 'C']);
      expect(answer).toEqual(['C']);
      expect(shuffled).toBe(false);
    }
  });

  it('普通选项识别为非位置相关', () => {
    expect(hasPositionalOption(ABCD)).toBe(false);
  });

  it('答案指向不存在的选项时原样保留，不会被悄悄判对', () => {
    const { answer } = shuffleChoiceOptions(ABCD, ['E'], mulberry32(2));
    expect(answer).toEqual(['E']);
    expect(gradeChoice(answer, ['A'])).toBe(false);
  });

  it('选项少于两个或答案为空时不炸', () => {
    const single = shuffleChoiceOptions([{ key: 'A', text: '唯一' }], [], mulberry32(1));
    expect(single.options).toEqual([{ key: 'A', text: '唯一' }]);
    expect(single.answer).toEqual([]);
    expect(shuffleOptions(ABCD, false, mulberry32(1))).toHaveLength(4);
  });
});
