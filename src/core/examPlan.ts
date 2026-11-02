import type { ExamPlan, QuestionType } from '../types';

/**
 * 考试卷面配比。默认值按附件 3 的试题结构来（填空 10 / 单选 20 / 判断 10 / 简答 3 / 论述 3），
 * 多选原卷没有，给 1 道垫着。用户在开始考试前可以逐题型改数字，这里只提供口径与钳制。
 */
export const EXAM_TYPES: QuestionType[] = ['fill', 'single', 'multi', 'judge', 'short', 'essay'];

export const DEFAULT_EXAM_PLAN: ExamPlan = {
  fill: 10,
  single: 20,
  multi: 1,
  judge: 10,
  short: 3,
  essay: 3,
};

export function emptyPlan(): ExamPlan {
  return { fill: 0, single: 0, multi: 0, judge: 0, short: 0, essay: 0 };
}

/** 各题型在某个池子里的库存（全题卷 = 整库，重点卷 = 重点题的 id 集合） */
export function countsByType(
  questions: ReadonlyArray<{ id: string; type: QuestionType }>,
  keyIds: ReadonlySet<string>,
  keyOnly: boolean,
): Record<QuestionType, number> {
  const counts = emptyPlan();
  for (const q of questions) {
    if (keyOnly && !keyIds.has(q.id)) continue;
    counts[q.type] = (counts[q.type] ?? 0) + 1;
  }
  return counts;
}

/** 任意输入 → 六题型 × 非负整数（不认识的键丢掉，负数/NaN/小数一律收拾干净） */
export function normalizePlan(raw: unknown): ExamPlan {
  const out = emptyPlan();
  if (raw && typeof raw === 'object') {
    for (const type of EXAM_TYPES) {
      const value = Number((raw as Record<string, unknown>)[type]);
      out[type] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }
  }
  return out;
}

/** 钳到库存上限：题库只有 3 道论述，配比写 10 也只能出 3 道 */
export function clampPlan(plan: ExamPlan, available: Partial<Record<QuestionType, number>>): ExamPlan {
  const out = emptyPlan();
  for (const type of EXAM_TYPES) {
    const want = Number.isFinite(plan[type]) ? Math.floor(plan[type] ?? 0) : 0;
    out[type] = Math.max(0, Math.min(want, available[type] ?? 0));
  }
  return out;
}

export function planTotal(plan: ExamPlan): number {
  return EXAM_TYPES.reduce((sum, type) => sum + (plan[type] ?? 0), 0);
}

/**
 * 输入框里的字符串 → 配比。空串、乱写当 0（不会因为一次手滑就让整卷开不出来），
 * 超过库存就钳到库存，页面上的「实际出 X 题」按这份算。
 */
export function draftToPlan(
  draft: Partial<Record<string, string>>,
  available: Partial<Record<QuestionType, number>>,
): ExamPlan {
  const raw = normalizePlan(draft);
  return clampPlan(raw, available);
}

/** 备份 / 会话里的 plan 字段：结构完全认不出来时返回 null（恢复时退回默认配比） */
export function readPlan(raw: unknown): ExamPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!EXAM_TYPES.some((type) => type in obj)) return null;
  return normalizePlan(obj);
}
