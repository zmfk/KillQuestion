import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportPanel } from '../components/ImportPanel';
import { questionNoLabel, topicsOf, typeLabel } from '../data/bank';
import { useQuiz } from '../store/quiz';
import styles from './PracticePage.module.css';

function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PracticePage() {
  const navigate = useNavigate();
  const session = useQuiz((s) => s.session);
  const current = useQuiz((s) => s.current);
  const picked = useQuiz((s) => s.picked);
  const fillInputs = useQuiz((s) => s.fillInputs);
  const submitted = useQuiz((s) => s.submitted);
  const lastCorrect = useQuiz((s) => s.lastCorrect);
  const awaitingSelfAssess = useQuiz((s) => s.awaitingSelfAssess);
  const togglePick = useQuiz((s) => s.togglePick);
  const setFill = useQuiz((s) => s.setFill);
  const submit = useQuiz((s) => s.submit);
  const selfAssess = useQuiz((s) => s.selfAssess);
  const next = useQuiz((s) => s.next);
  const finish = useQuiz((s) => s.finish);
  const toggleStar = useQuiz((s) => s.toggleStar);
  const stars = useQuiz((s) => s.progress.stars);
  const index = useQuiz((s) => s.index);

  const [materialOpen, setMaterialOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session?.endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.endsAt]);

  useEffect(() => {
    setMaterialOpen(false);
  }, [current?.id]);

  // 考试时间到，自动交卷
  useEffect(() => {
    if (!session?.endsAt) return;
    if (now >= session.endsAt) {
      finish();
      navigate('/result', { replace: true });
    }
  }, [now, session?.endsAt, finish, navigate]);

  const topics = useMemo(
    () => (current && index ? topicsOf(current, index.topicById) : []),
    [current, index],
  );

  if (!index) return <ImportPanel />;

  if (!session || !current) {
    return (
      <div className={styles.empty}>
        <p>当前没有进行中的练习。</p>
        <button type="button" className="btn btnPrimary" onClick={() => navigate('/')}>
          回首页选题
        </button>
      </div>
    );
  }

  const total = session.queue.length;
  const done = session.index;
  const percent = Math.round((done / total) * 100);
  const remainingMs = session.endsAt ? session.endsAt - now : 0;
  const starred = stars.includes(current.id);
  const isChoice = current.type === 'single' || current.type === 'multi';
  const isFill = current.type === 'fill';
  const isEssay = current.type === 'short' || current.type === 'essay';

  const stopPractice = () => {
    finish();
    navigate('/result');
  };

  const handleNext = () => {
    if (session.index + 1 >= total) {
      finish();
      navigate('/result');
      return;
    }
    next();
  };

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <button type="button" className="btn btnGhost" onClick={() => navigate('/')}>
          ← 退出
        </button>
        <span className={styles.modeTag}>{session.label}</span>
        <span className={styles.counter}>
          {Math.min(done + 1, total)} / {total}
        </span>
        {session.endsAt ? (
          <span className={`${styles.clock} ${remainingMs < 300000 ? styles.clockUrgent : ''}`}>
            ⏱ {formatClock(remainingMs)}
          </span>
        ) : null}
        <button type="button" className="btn btnGhost" onClick={stopPractice}>
          结束本轮
        </button>
      </div>

      <div className={styles.progress}>
        <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>

      <article className={styles.card}>
        <div className={styles.metaRow}>
          <span className={styles.no}>
            {questionNoLabel(current)}
            <em>{typeLabel(current.type)}</em>
          </span>
          {topics.length > 0 && (
            <span className={styles.topics}>
              {topics.map((t) => (
                <span key={t.id} className={styles.topic}>
                  {t.title}
                </span>
              ))}
            </span>
          )}
          <button
            type="button"
            className={`${styles.starBtn} ${starred ? styles.starred : ''}`}
            onClick={() => toggleStar(current.id)}
            aria-label="收藏"
          >
            {starred ? '★' : '☆'}
          </button>
        </div>

        {current.material && (
          <div className={styles.materialBox}>
            <button
              type="button"
              className={styles.materialToggle}
              onClick={() => setMaterialOpen((v) => !v)}
            >
              {materialOpen ? '▾ 收起材料' : '▸ 展开材料（论述题共用）'}
            </button>
            <div className={`${styles.material} ${materialOpen ? styles.materialOpen : ''}`}>
              {current.material}
            </div>
          </div>
        )}

        <h2 className={styles.stem}>{current.stem}</h2>

        {current.type === 'multi' && <p className={styles.tip}>多选题：选出所有正确项</p>}

        {isChoice && current.options && (
          <ul className={styles.options}>
            {current.options.map((opt) => {
              const isPicked = picked.includes(opt.key);
              const isAnswer = (current.answer ?? []).includes(opt.key);
              const showRight = submitted && isAnswer;
              const showWrong = submitted && isPicked && !isAnswer;
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    disabled={submitted}
                    onClick={() => togglePick(opt.key)}
                    className={[
                      styles.option,
                      isPicked ? styles.optionPicked : '',
                      showRight ? styles.optionRight : '',
                      showWrong ? styles.optionWrong : '',
                    ].join(' ')}
                  >
                    <span className={styles.optionKey}>{opt.key}</span>
                    <span className={styles.optionText}>{opt.text}</span>
                    {showRight && <span className={styles.optionMark}>✓</span>}
                    {showWrong && <span className={styles.optionMark}>✗</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {isFill && (
          <div className={styles.fillArea}>
            {fillInputs.map((value, i) => {
              const answer = current.answer?.[i] ?? '';
              const correctOne = submitted && lastCorrect !== null && lastCorrect;
              return (
                <label key={i} className={styles.fillRow}>
                  <span className={styles.fillIndex}>第 {i + 1} 空</span>
                  <input
                    className={`input ${styles.fillInput}`}
                    value={value}
                    disabled={submitted}
                    onChange={(e) => setFill(i, e.target.value)}
                    placeholder="填写答案"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !submitted) submit();
                    }}
                  />
                  {submitted && (
                    <span className={correctOne ? styles.fillOk : styles.fillMiss}>
                      参考答案：{answer || '—'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {isEssay && (
          <div className={styles.essayArea}>
            <p className={styles.tip}>
              {current.type === 'short'
                ? '先在心里组织答案，再点「对答案」并自评。'
                : '论述题按「观点 + 事例 + 联系实际」组织，200–300 字。'}
            </p>
            {submitted && (
              <div className={styles.answerBox}>
                <span className={styles.answerLabel}>参考答案</span>
                <p>{current.answerText || '（原书未给出参考答案）'}</p>
              </div>
            )}
          </div>
        )}

        {submitted && isChoice && (
          <div className={`${styles.verdict} ${lastCorrect ? styles.verdictOk : styles.verdictBad}`}>
            <strong>{lastCorrect ? '答对了' : '答错了'}</strong>
            <span>
              正确答案：
              {(current.answer ?? [])
                .map((k) => {
                  const opt = current.options?.find((o) => o.key === k);
                  return opt ? `${k}. ${opt.text}` : k;
                })
                .join('　')}
            </span>
          </div>
        )}

        {submitted && isFill && lastCorrect !== null && (
          <div className={`${styles.verdict} ${lastCorrect ? styles.verdictOk : styles.verdictBad}`}>
            <strong>{lastCorrect ? '全对' : '有错'}</strong>
            <span>
              参考答案：{(current.answer ?? []).join('；') || current.answerText}
            </span>
          </div>
        )}
      </article>

      <div className={styles.actions}>
        {!submitted && (
          <button
            type="button"
            className="btn btnPrimary"
            onClick={submit}
            disabled={isChoice && picked.length === 0}
          >
            {isEssay ? '对答案' : '提交答案'}
          </button>
        )}

        {awaitingSelfAssess && (
          <>
            <span className={styles.assessTip}>对照答案，自己这道题算：</span>
            <button type="button" className="btn" onClick={() => selfAssess(false)}>
              没答上来
            </button>
            <button type="button" className="btn btnPrimary" onClick={() => selfAssess(true)}>
              答上来了
            </button>
          </>
        )}

        {submitted && !awaitingSelfAssess && (
          <button type="button" className="btn btnPrimary" onClick={handleNext}>
            {session.index + 1 >= total ? '完成本轮' : '下一题'}
          </button>
        )}
      </div>
    </div>
  );
}
