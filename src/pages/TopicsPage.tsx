import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportPanel } from '../components/ImportPanel';
import { useQuiz } from '../store/quiz';
import styles from './TopicsPage.module.css';

export function TopicsPage() {
  const navigate = useNavigate();
  const index = useQuiz((s) => s.index);
  const start = useQuiz((s) => s.start);
  const records = useQuiz((s) => s.progress.records);
  const [collapsed, setCollapsed] = useState<string | null>(null);

  const sections = useMemo(() => {
    if (!index) return [];
    const map = new Map<string, typeof index.topics>();
    for (const t of index.topics) {
      const list = map.get(t.section) ?? [];
      list.push(t);
      map.set(t.section, list);
    }
    return Array.from(map.entries());
  }, [index]);

  if (!index) return <ImportPanel />;

  const idsOf = (topicIds: string[]) =>
    index.questions.filter((q) => q.topicIds.some((id) => topicIds.includes(id))).map((q) => q.id);

  const masteredOf = (ids: string[]) =>
    ids.filter((id) => {
      const r = records[id];
      return r !== undefined && r.right > r.wrong;
    }).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>按考点刷</h1>
        <p className="hint">
          这些考点来自划重点页。点开任意考点，只刷与它相关的题；题目数多的考点可以反复练。
        </p>
      </header>

      {sections.map(([section, list]) => {
        const ids = idsOf(list.map((t) => t.id));
        const open = collapsed !== section;
        return (
          <section key={section} className={styles.section}>
            <button
              type="button"
              className={styles.sectionHead}
              onClick={() => setCollapsed(open ? section : null)}
            >
              <strong>{section}</strong>
              <span className={styles.sectionMeta}>
                {list.length} 个考点 · {ids.length} 道题 · {masteredOf(ids)} 已掌握
              </span>
              <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
            </button>
            {open && (
              <div className={styles.topicGrid}>
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.topicCard}
                    disabled={t.count === 0}
                    onClick={() => {
                      if (start('topic', { topicId: t.id })) navigate('/practice');
                    }}
                  >
                    <span className={styles.topicTitle}>{t.title}</span>
                    <span className={styles.topicCount}>
                      {t.count > 0 ? `${t.count} 道题` : '题库暂未收录'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
