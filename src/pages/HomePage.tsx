import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImportPanel } from '../components/ImportPanel';
import { useQuiz } from '../store/quiz';
import styles from './HomePage.module.css';

export function HomePage() {
  const navigate = useNavigate();
  const index = useQuiz((s) => s.index);
  const progress = useQuiz((s) => s.progress);
  const session = useQuiz((s) => s.session);
  const start = useQuiz((s) => s.start);

  const stats = useMemo(() => {
    const records = Object.values(progress.records);
    const answered = Object.keys(progress.records).length;
    const totalRight = records.reduce((n, r) => n + r.right, 0);
    const totalWrong = records.reduce((n, r) => n + r.wrong, 0);
    const attempts = totalRight + totalWrong;
    const total = index?.questions.length ?? 0;
    return {
      answered,
      accuracy: attempts === 0 ? 0 : Math.round((totalRight / attempts) * 100),
      wrongPending: records.filter((r) => r.wrong > r.right).length,
      starred: progress.stars.length,
      covered: total === 0 ? 0 : Math.round((answered / total) * 100),
    };
  }, [progress, index]);

  if (!index) return <ImportPanel />;

  const total = index.questions.length;
  const keyTotal = index.keyIds.length;
  const topicTotal = index.topics.length;
  const resume = session && session.index < session.queue.length ? session : null;

  const go = (mode: Parameters<typeof start>[0], opts?: Parameters<typeof start>[1]) => {
    if (start(mode, opts)) navigate('/practice');
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>党校结业考试 · 题库</p>
        <h1 className={styles.title}>把整套题库刷穿</h1>
        <p className={styles.lead}>
          全部 {total} 道题：填空、单选、多选、简答、论述。
          {topicTotal > 0
            ? `划重点的 ${topicTotal} 个考点做了标注，想练哪块点哪块。`
            : '还没有划重点的标注——拖一份划重点进来，「重点刷题」才会亮。'}
        </p>
        <div className={styles.pills}>
          <span className={styles.pill}>共 {total} 题</span>
          <span className={styles.pill}>{keyTotal} 道重点题</span>
          <span className={styles.pill}>{topicTotal} 个考点</span>
        </div>
      </section>

      {resume && (
        <section className={styles.resume}>
          <div>
            <strong>上次没刷完</strong>
            <p>
              {resume.label} · 第 {Math.min(resume.index + 1, resume.queue.length)} /{' '}
              {resume.queue.length} 题
            </p>
          </div>
          <button type="button" className="btn btnPrimary" onClick={() => navigate('/practice')}>
            接着刷
          </button>
        </section>
      )}

      <section className={styles.grid}>
        <button
          type="button"
          className={`${styles.modeCard} ${keyTotal > 0 ? styles.primary : ''}`}
          onClick={() => (keyTotal > 0 ? go('key') : navigate('/import'))}
        >
          <span className={styles.modeIcon}>★</span>
          <span className={styles.modeBody}>
            <strong>重点刷题</strong>
            <small>
              {keyTotal > 0
                ? `只刷划重点的 ${keyTotal} 道题，考前冲刺用`
                : '还没导入划重点——拖一份进来就能按重点刷'}
            </small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button type="button" className={styles.modeCard} onClick={() => go('all')}>
          <span className={styles.modeIcon}>◎</span>
          <span className={styles.modeBody}>
            <strong>大范围刷题</strong>
            <small>全部 {total} 道题随机过一遍，不留死角</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button type="button" className={styles.modeCard} onClick={() => go('all', { ordered: true })}>
          <span className={styles.modeIcon}>☰</span>
          <span className={styles.modeBody}>
            <strong>顺序通刷</strong>
            <small>按手册原顺序（填空→选择→简答→论述）从头过</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button type="button" className={styles.modeCard} onClick={() => go('exam')}>
          <span className={styles.modeIcon}>⏱</span>
          <span className={styles.modeBody}>
            <strong>模拟考试</strong>
            <small>按真实卷面配比组卷，60 分钟计时</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button
          type="button"
          className={styles.modeCard}
          onClick={() => go('wrong')}
          disabled={stats.wrongPending === 0}
        >
          <span className={styles.modeIcon}>✗</span>
          <span className={styles.modeBody}>
            <strong>错题重刷</strong>
            <small>
              {stats.wrongPending > 0 ? `${stats.wrongPending} 道题还没吃透` : '还没有错题，先刷几道'}
            </small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button
          type="button"
          className={styles.modeCard}
          onClick={() => go('star')}
          disabled={stats.starred === 0}
        >
          <span className={styles.modeIcon}>♡</span>
          <span className={styles.modeBody}>
            <strong>收藏夹</strong>
            <small>{stats.starred > 0 ? `${stats.starred} 道收藏题` : '做题时点星标收藏到这里'}</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>
      </section>

      <section className={styles.stats}>
        <h2 className={styles.statsTitle}>学习进度</h2>
        <div className={styles.statRow}>
          <Stat label="已练题数" value={`${stats.answered}`} suffix={`/ ${total}`} />
          <Stat label="题库覆盖" value={`${stats.covered}%`} />
          <Stat label="累计正确率" value={`${stats.accuracy}%`} />
          <Stat label="完成轮次" value={`${progress.finishedSessions}`} />
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${Math.min(100, stats.covered)}%` }} />
        </div>
        <p className="hint">
          数据存在本机浏览器，换设备或清缓存会丢。建议固定用同一个访问地址：在线版与本地包的数据互不相通。
        </p>
      </section>

      <section className={styles.links}>
        <button
          type="button"
          className="btn"
          onClick={() => navigate(topicTotal > 0 ? '/topics' : '/import')}
        >
          {topicTotal > 0 ? `按考点刷（${topicTotal} 个）` : '还没导入划重点'}
        </button>
        <button type="button" className="btn" onClick={() => navigate('/library')}>
          浏览全部题目
        </button>
        <button type="button" className="btn" onClick={() => navigate('/import')}>
          换题库 / 补划重点
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>
        {value}
        {suffix ? <em>{suffix}</em> : null}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
