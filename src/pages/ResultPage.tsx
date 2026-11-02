import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuiz } from '../store/quiz';
import styles from './ResultPage.module.css';

export function ResultPage() {
  const navigate = useNavigate();
  const session = useQuiz((s) => s.session);
  const index = useQuiz((s) => s.index);
  const start = useQuiz((s) => s.start);
  const resetAll = useQuiz((s) => s.resetAll);

  const summary = useMemo(() => {
    if (!session) return null;
    const results = session.results;
    const correct = results.filter((r) => r.correct).length;
    const total = results.length;
    const wrongIds = results.filter((r) => !r.correct).map((r) => r.questionId);
    const usedMs = (results.at(-1)?.at ?? session.startedAt) - session.startedAt;
    return {
      total,
      correct,
      wrongIds,
      accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
      usedMs,
    };
  }, [session]);

  if (!session || !summary || !index) {
    return (
      <div className={styles.empty}>
        <p>还没有练习记录。</p>
        <button type="button" className="btn btnPrimary" onClick={() => navigate('/')}>
          回首页
        </button>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round(summary.usedMs / 60000));
  const grade =
    summary.accuracy >= 90 ? '稳了' : summary.accuracy >= 75 ? '还行' : summary.accuracy >= 60 ? '有点虚' : '得重来';

  return (
    <div className={styles.page}>
      <section className={styles.head}>
        <p className={styles.eyebrow}>{session.label} · 本轮结算</p>
        <h1 className={styles.score}>
          {summary.accuracy}
          <em>%</em>
        </h1>
        <p className={styles.grade}>{grade}</p>
        <div className={styles.numbers}>
          <span>
            答对 <strong>{summary.correct}</strong>
          </span>
          <span>
            答错 <strong>{summary.wrongIds.length}</strong>
          </span>
          <span>
            共答 <strong>{summary.total}</strong>
          </span>
          <span>
            用时 <strong>{minutes}</strong> 分钟
          </span>
        </div>
      </section>

      {summary.wrongIds.length > 0 && (
        <section className={styles.wrongBox}>
          <h2>本轮错题（{summary.wrongIds.length}）</h2>
          <ul className={styles.wrongList}>
            {summary.wrongIds.map((id) => {
              const q = index?.questionById.get(id);
              if (!q) return null;
              return (
                <li key={id}>
                  <span className={styles.wrongNo}>{q.sectionLabel} {q.no}</span>
                  <span className={styles.wrongStem}>{q.stem.slice(0, 60)}</span>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => {
              start('wrong');
              navigate('/practice');
            }}
          >
            立刻重刷错题
          </button>
        </section>
      )}

      <section className={styles.actions}>
        <button
          type="button"
          className="btn btnPrimary"
          onClick={() => {
            start(session.mode, { topicId: session.topicId, plan: session.plan });
            navigate('/practice');
          }}
        >
          再来一轮
        </button>
        <Link to="/topics" className="btn">
          按考点练
        </Link>
        <Link to="/" className="btn">
          回首页
        </Link>
      </section>

      <p className={styles.resetZone}>
        <button type="button" className={styles.resetBtn} onClick={resetAll}>
          清空全部学习记录
        </button>
      </p>
    </div>
  );
}
