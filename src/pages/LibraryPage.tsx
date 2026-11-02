import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportPanel } from '../components/ImportPanel';
import { topicsOf, typeLabel } from '../data/bank';
import { useQuiz } from '../store/quiz';
import type { QuestionType } from '../types';
import styles from './LibraryPage.module.css';

const TYPE_FILTERS: Array<{ key: QuestionType | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'single', label: '单选' },
  { key: 'multi', label: '多选' },
  { key: 'judge', label: '判断' },
  { key: 'fill', label: '填空' },
  { key: 'short', label: '简答' },
  { key: 'essay', label: '论述' },
];

const PAGE_SIZE = 40;

export function LibraryPage() {
  const navigate = useNavigate();
  const index = useQuiz((s) => s.index);
  const start = useQuiz((s) => s.start);
  const records = useQuiz((s) => s.progress.records);
  const stars = useQuiz((s) => s.progress.stars);
  const toggleStar = useQuiz((s) => s.toggleStar);
  const setKeyOverride = useQuiz((s) => s.setKeyOverride);

  const [type, setType] = useState<QuestionType | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [onlyKey, setOnlyKey] = useState(false);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const keySet = useMemo(() => new Set(index?.keyIds ?? []), [index]);

  const filtered = useMemo(() => {
    if (!index) return [];
    const kw = keyword.trim();
    return index.questions.filter((q) => {
      if (type !== 'all' && q.type !== type) return false;
      if (onlyKey && !keySet.has(q.id)) return false;
      if (kw && !q.stem.includes(kw) && !(q.answerText ?? '').includes(kw)) return false;
      return true;
    });
  }, [index, type, keyword, onlyKey, keySet]);

  if (!index) return <ImportPanel />;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>题库（{index.questions.length} 题）</h1>
        <p className="hint">
          全部题目与答案。点标题展开看答案，星标可收藏；「☆ 设重点 / ★ 重点」能把任意题在重点与普通之间切换
          （只改本机，不动题库原文）。
        </p>
      </header>

      <div className={styles.filters}>
        <div className={styles.chips}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.chip} ${type === f.key ? styles.chipActive : ''}`}
              onClick={() => {
                setType(f.key);
                reset();
              }}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.chip} ${onlyKey ? styles.chipActive : ''}`}
            onClick={() => {
              setOnlyKey((v) => !v);
              reset();
            }}
          >
            ★ 只看重点
          </button>
        </div>
        <input
          className={`input ${styles.search}`}
          placeholder="搜索题干或答案…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            reset();
          }}
        />
      </div>

      <p className={styles.count}>共 {filtered.length} 题</p>

      <ul className={styles.list}>
        {slice.map((q) => {
          const rec = records[q.id];
          const open = openId === q.id;
          const starred = stars.includes(q.id);
          const isKey = keySet.has(q.id);
          return (
            <li key={q.id} className={styles.item}>
              <div className={styles.itemHead}>
                <button type="button" className={styles.stemBtn} onClick={() => setOpenId(open ? null : q.id)}>
                  <span className={styles.tag}>{typeLabel(q.type)}</span>
                  <span className={styles.stem}>{q.stem.slice(0, 70)}</span>
                  {rec && (
                    <span className={rec.wrong > rec.right ? styles.badState : styles.okState}>
                      {rec.right > 0 ? `对${rec.right}` : ''}
                      {rec.wrong > 0 ? ` 错${rec.wrong}` : ''}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.keyBtn} ${isKey ? styles.keyOn : ''}`}
                  onClick={() => setKeyOverride(q.id, !isKey)}
                  data-key-toggle={q.id}
                  title={isKey ? '降为普通题（只改本机，不动题库原文）' : '提升为重点题（只改本机，不动题库原文）'}
                >
                  {isKey ? '★ 重点' : '☆ 设重点'}
                </button>
                <button
                  type="button"
                  className={`${styles.star} ${starred ? styles.starOn : ''}`}
                  onClick={() => toggleStar(q.id)}
                >
                  {starred ? '★' : '☆'}
                </button>
              </div>
              {open && (
                <div className={styles.detail}>
                  {q.material && <p className={styles.material}>{q.material}</p>}
                  <p className={styles.fullStem}>{q.stem}</p>
                  {q.options && (
                    <ul className={styles.opts}>
                      {q.options.map((o) => (
                        <li key={o.key} className={(q.answer ?? []).includes(o.key) ? styles.rightOpt : ''}>
                          <b>{o.key}</b> {o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={styles.answer}>
                    <span>答案</span>
                    {q.answerText || (q.answer ?? []).join('；') || '（暂无）'}
                  </p>
                  {q.topicIds.length > 0 && (
                    <p className={styles.topics}>
                      {topicsOf(q, index.topicById).map((t) => (
                        <span key={t.id}>{t.title}</span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button type="button" className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            上一页
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn"
            disabled={safePage + 1 >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            下一页
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <button
          type="button"
          className="btn btnPrimary"
          onClick={() => {
            if (start('all')) navigate('/practice');
          }}
        >
          从全部题目里随机刷
        </button>
      )}
    </div>
  );
}
