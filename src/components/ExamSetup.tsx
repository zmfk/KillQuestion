import { useMemo, useState } from 'react';
import {
  countsByType,
  DEFAULT_EXAM_PLAN,
  draftToPlan,
  EXAM_TYPES,
  normalizePlan,
  planTotal,
} from '../core/examPlan';
import { typeLabel } from '../data/bank';
import { useQuiz } from '../store/quiz';
import styles from './ExamSetup.module.css';
import type { ExamPlan } from '../types';

interface Props {
  /** 从哪张卡进来的：决定面板打开时默认看哪一档 */
  mode: 'exam' | 'examKey';
  onClose: () => void;
  onStart: (mode: 'exam' | 'examKey', plan: ExamPlan) => void;
}

/**
 * 考试配比面板：逐题型填数量，0 表示这一场不出该题型。
 * 默认值是附件 3 的卷面结构；填超库存只按库存出，不拿别的题型凑数。
 */
export function ExamSetup({ mode, onClose, onStart }: Props) {
  const index = useQuiz((s) => s.index);
  const examPlan = useQuiz((s) => s.examPlan);

  const [tab, setTab] = useState<'exam' | 'examKey'>(mode);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const saved = normalizePlan(examPlan);
    return Object.fromEntries(EXAM_TYPES.map((type) => [type, String(saved[type] ?? 0)]));
  });

  const available = useMemo(
    () => countsByType(index?.questions ?? [], new Set(index?.keyIds ?? []), tab === 'examKey'),
    [index, tab],
  );

  const wanted = normalizePlan(draft);
  const plan = draftToPlan(draft, available);
  const total = planTotal(plan);
  const over = EXAM_TYPES.filter((type) => wanted[type] > (available[type] ?? 0));
  const allStock = EXAM_TYPES.reduce((sum, type) => sum + (available[type] ?? 0), 0);

  const setCount = (type: string, value: string) => {
    setDraft((prev) => ({ ...prev, [type]: value }));
  };

  const restoreDefault = () => {
    setDraft(
      Object.fromEntries(EXAM_TYPES.map((type) => [type, String(DEFAULT_EXAM_PLAN[type])])),
    );
  };

  return (
    <section className={styles.panel} aria-label="考试配比">
      <div className={styles.head}>
        <div>
          <strong className={styles.title}>题型数量</strong>
          <p className={styles.hint}>
            逐题型填数量，0 表示这一场不出。填得比库存多只会按库存出，不会拿别的题型凑。
          </p>
        </div>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'exam' ? styles.tabActive : ''}`}
            onClick={() => setTab('exam')}
          >
            全题卷
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'examKey' ? styles.tabActive : ''}`}
            onClick={() => setTab('examKey')}
          >
            重点卷
          </button>
          <button type="button" className="btn btnGhost" onClick={onClose}>
            收起
          </button>
        </div>
      </div>

      <div className={styles.rows}>
        {EXAM_TYPES.map((type) => (
          <label key={type} className={styles.row}>
            <span className={styles.label}>{typeLabel(type)}</span>
            <input
              type="number"
              className={styles.input}
              min={0}
              step={1}
              inputMode="numeric"
              value={draft[type] ?? '0'}
              data-plan={type}
              onChange={(e) => setCount(type, e.target.value)}
              aria-label={`${typeLabel(type)}题数`}
            />
            <span className={styles.stock}>
              库存 <b>{available[type] ?? 0}</b>
              {tab === 'exam' ? ' · 全库' : ' · 重点'}
            </span>
          </label>
        ))}
      </div>

      <div className={styles.foot}>
        <div className={styles.summary}>
          实际出卷 <b data-plan-total>{total}</b> 题 ·{' '}
          {tab === 'examKey' ? `重点题库共 ${allStock} 题` : `整库共 ${allStock} 题`} · 60 分钟
          {over.length > 0 && (
            <span className={styles.warn}>
              {over.map((type) => typeLabel(type)).join('、')}不够填的数量，按库存出
            </span>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={restoreDefault}>
            恢复默认配比
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={total === 0}
            onClick={() => onStart(tab, plan)}
            data-plan-start
          >
            {total === 0 ? '至少出 1 题' : `按这套开考（${tab === 'examKey' ? '重点卷' : '全题卷'}）`}
          </button>
        </div>
      </div>
    </section>
  );
}
