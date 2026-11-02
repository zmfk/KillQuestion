import { describe, expect, it } from 'vitest';
import {
  clampPlan,
  countsByType,
  DEFAULT_EXAM_PLAN,
  draftToPlan,
  emptyPlan,
  normalizePlan,
  planTotal,
  readPlan,
} from './examPlan';
import type { Question } from '../types';

const QUESTIONS: Question[] = [
  { id: 'Q1', type: 'single', no: 1, section: 'choice', sectionLabel: '选择题', stem: '一', topicIds: ['k1'] },
  { id: 'Q2', type: 'single', no: 2, section: 'choice', sectionLabel: '选择题', stem: '二', topicIds: [] },
  { id: 'Q3', type: 'fill', no: 3, section: 'fill', sectionLabel: '填空题', stem: '三', topicIds: ['k1'] },
  { id: 'Q4', type: 'essay', no: 4, section: 'essay', sectionLabel: '论述题', stem: '四', topicIds: ['k1'] },
];

describe('考试配比：整理与钳制', () => {
  it('默认配比就是原卷结构，合计 47 题', () => {
    expect(DEFAULT_EXAM_PLAN).toEqual({ fill: 10, single: 20, multi: 1, judge: 10, short: 3, essay: 3 });
    expect(planTotal(DEFAULT_EXAM_PLAN)).toBe(47);
  });

  it('乱写的配比被收拾成六种题型 × 非负整数', () => {
    const plan = normalizePlan({
      fill: '3',
      single: 2.9,
      multi: -4,
      judge: '随便写',
      short: null,
      essay: 1,
      多余题型: 99,
    });
    expect(plan).toEqual({ fill: 3, single: 2, multi: 0, judge: 0, short: 0, essay: 1 });
    expect(normalizePlan(undefined)).toEqual(emptyPlan());
  });

  it('填得比库存多只出库存那么多，不补别的题型', () => {
    const available = countsByType(QUESTIONS, false);
    expect(available).toEqual({ fill: 1, single: 2, multi: 0, judge: 0, short: 0, essay: 1 });

    const plan = clampPlan({ fill: 10, single: 20, multi: 5, judge: 10, short: 3, essay: 3 }, available);
    expect(plan).toEqual({ fill: 1, single: 2, multi: 0, judge: 0, short: 0, essay: 1 });
    expect(planTotal(plan)).toBe(4);
  });

  it('重点卷的库存只算划了重点的题', () => {
    expect(countsByType(QUESTIONS, true)).toEqual({
      fill: 1,
      single: 1,
      multi: 0,
      judge: 0,
      short: 0,
      essay: 1,
    });
  });

  it('输入框里的字符串：空串和乱写当 0，超库存钳到库存', () => {
    const available = countsByType(QUESTIONS, false);
    const plan = draftToPlan(
      { fill: '7', single: '', multi: 'abc', judge: '0', short: '2', essay: '5' },
      available,
    );
    expect(plan).toEqual({ fill: 1, single: 0, multi: 0, judge: 0, short: 0, essay: 1 });
  });

  it('从备份里读配比：对象就规整，不是对象返回 null', () => {
    expect(readPlan({ single: 4 })).toEqual({ fill: 0, single: 4, multi: 0, judge: 0, short: 0, essay: 0 });
    expect(readPlan({ 别的字段: 1 })).toBeNull();
    expect(readPlan('字符串')).toBeNull();
    expect(readPlan(null)).toBeNull();
  });
});
