import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportPanel } from '../components/ImportPanel';
import { normalizeJudge, JUDGE_FALSE, JUDGE_TRUE } from '../core/grade';
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
  const essayInput = useQuiz((s) => s.essayInput);
  const essayVerdict = useQuiz((s) => s.essayVerdict);
  const submitted = useQuiz((s) => s.submitted);
  const lastCorrect = useQuiz((s) => s.lastCorrect);
  const awaitingSelfAssess = useQuiz((s) => s.awaitingSelfAssess);
  const togglePick = useQuiz((s) => s.togglePick);
  const setFill = useQuiz((s) => s.setFill);
  const setEssay = useQuiz((s) => s.setEssay);
  const submit = useQuiz((s) => s.submit);
  const selfAssess = useQuiz((s) => s.selfAssess);
  const reviseEssay = useQuiz((s) => s.reviseEssay);
  const next = useQuiz((s) => s.next);
  const finish = useQuiz((s) => s.finish);
  const toggleStar = useQuiz((s) => s.toggleStar);
  const stars = useQuiz((s) => s.progress.stars);
  const setKeyOverride = useQuiz((s) => s.setKeyOverride);
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
  const isKey = index?.keyIds.includes(current.id) ?? false;
  const isChoice = current.type === 'single' || current.type === 'multi';
  const isJudge = current.type === 'judge';
  const judgeAnswer = isJudge ? normalizeJudge(current.answer?.[0] ?? '') : null;
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
            className={`${styles.keyBtn} ${isKey ? styles.keyOn : ''}`}
            onClick={() => setKeyOverride(current.id, !isKey)}
            data-key-toggle
            title={isKey ? '降为普通题（只改本机，不动题库原文）' : '提升为重点题（只改本机，不动题库原文）'}
          >
            {isKey ? '★ 重点' : '☆ 设为重点'}
          </button>
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
        {isJudge && <p className={styles.tip}>判断题：这句话说得对就选「正确」，不对选「错误」</p>}

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

        {isJudge && (
          <div className={styles.judgeRow}>
            {[JUDGE_TRUE, JUDGE_FALSE].map((value) => {
              const isPicked = picked.includes(value);
              const showRight = submitted && judgeAnswer === value;
              const showWrong = submitted && isPicked && judgeAnswer !== value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={submitted}
                  onClick={() => togglePick(value)}
                  className={[
                    styles.option,
                    styles.judgeBtn,
                    isPicked ? styles.optionPicked : '',
                    showRight ? styles.optionRight : '',
                    showWrong ? styles.optionWrong : '',
                  ].join(' ')}
                >
                  <span className={styles.optionKey}>{value === JUDGE_TRUE ? '✓' : '✗'}</span>
                  <span className={styles.optionText}>{value}</span>
                  {showRight && <span className={styles.optionMark}>✓</span>}
                  {showWrong && <span className={styles.optionMark}>✗</span>}
                </button>
              );
            })}
          </div>
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
                      参考答案：{answer || '（题库未给）'}
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
                ? '把要点写下来交卷：会逐条对照参考答案，达到 55% 判对，判得不对可以自己改判。'
                : '论述题按「观点 + 事例 + 联系实际」组织，200–300 字；交卷后逐条对照参考答案要点。'}
            </p>
            <textarea
              className={`textarea ${styles.essayInput}`}
              value={essayInput}
              readOnly={submitted}
              onChange={(e) => setEssay(e.target.value)}
              rows={current.type === 'short' ? 4 : 8}
              placeholder="在这里作答（写要点就行，交卷后自动对照参考答案）"
            />
            {submitted && !essayVerdict && (
              <div className={styles.answerBox}>
                <span className={styles.answerLabel}>参考答案</span>
                <p>{current.answerText || '（原书未给出参考答案）'}</p>
              </div>
            )}
          </div>
        )}

        {submitted && isEssay && essayVerdict && (
          <>
            <div className={`${styles.verdict} ${lastCorrect ? styles.verdictOk : styles.verdictBad}`}>
              <strong>{lastCorrect ? '答对了' : '没答到要点'}</strong>
              <span>
                与参考答案匹配 {Math.round(essayVerdict.score * 100)}% · 答到{' '}
                {essayVerdict.matched}/{essayVerdict.total} 条要点（≥
                {Math.round(essayVerdict.passRatio * 100)}% 判对，词面对照仅供参考）
                {lastCorrect !== essayVerdict.correct && (
                  <em className={styles.revisedTag}>已按你的判断改判</em>
                )}
              </span>
            </div>
            <div className={styles.pointBox}>
              <span className={styles.answerLabel}>逐条对照</span>
              {essayVerdict.points.map((point, i) => (
                <p
                  key={`${i}-${point.text.slice(0, 8)}`}
                  className={point.covered ? styles.pointHit : styles.pointMiss}
                >
                  <em>{point.covered ? '✓' : '○'}</em>
                  {point.text}
                </p>
              ))}
            </div>
          </>
        )}

        {submitted && awaitingSelfAssess && !isEssay && (
          <div className={styles.answerBox}>
            <span className={styles.answerLabel}>没有参考答案</span>
            <p>
              {current.answerText?.trim() ||
                (current.answer ?? []).join('；') ||
                '这道题的题库里没给答案（生成题库缺答案时很常见）。按你自己的笔记判断掌握了没有，选下面的按钮就行，不会记成错题。'}
            </p>
          </div>
        )}

        {submitted && isChoice && !awaitingSelfAssess && (
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

        {submitted && isJudge && judgeAnswer !== null && (
          <div className={`${styles.verdict} ${lastCorrect ? styles.verdictOk : styles.verdictBad}`}>
            <strong>{lastCorrect ? '答对了' : '答错了'}</strong>
            <span>正确答案：{judgeAnswer}</span>
          </div>
        )}

        {submitted && isJudge && judgeAnswer === null && (
          <div className={styles.answerBox}>
            <span className={styles.answerLabel}>参考答案</span>
            <p>{current.answerText || '（原题未给答案）'}</p>
          </div>
        )}

        {submitted && isFill && lastCorrect !== null && !awaitingSelfAssess && (
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
            disabled={
              isChoice && (current.options?.length ?? 0) > 0 && picked.length === 0
            }
          >
            {isEssay ? '交卷对照答案' : '提交答案'}
          </button>
        )}

        {/* 兜底出口：任何题（包括结构残缺、没有选项、没答案的）都能跳过，不至于卡死在一题上 */}
        {!submitted && (
          <button type="button" className="btn btnGhost" onClick={handleNext}>
            跳过这题
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

        {submitted && !awaitingSelfAssess && isEssay && essayVerdict && (
          <>
            <span className={styles.assessTip}>
              {lastCorrect ? '其实没答到要点？' : '其实答到要点了？'}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => reviseEssay(!lastCorrect)}
            >
              {lastCorrect ? '算我答错' : '算我答对'}
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
