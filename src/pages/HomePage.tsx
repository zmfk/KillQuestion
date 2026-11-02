import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExamSetup } from '../components/ExamSetup';
import { ImportPanel } from '../components/ImportPanel';
import { useQuiz } from '../store/quiz';
import styles from './HomePage.module.css';
import type { ExamPlan } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const index = useQuiz((s) => s.index);
  const progress = useQuiz((s) => s.progress);
  const session = useQuiz((s) => s.session);
  const start = useQuiz((s) => s.start);
  const setExamPlan = useQuiz((s) => s.setExamPlan);
  /** 正在调配比的那张考试卡；null 时面板收起 */
  const [examSetup, setExamSetup] = useState<'exam' | 'examKey' | null>(null);

  const stats = useMemo(() => {
    const records = Object.values(progress.records);
    const answered = Object.keys(progress.records).length;
    const totalRight = records.reduce((n, r) => n + r.right, 0);
    const totalWrong = records.reduce((n, r) => n + r.wrong, 0);
    const attempts = totalRight + totalWrong;
    const total = index?.questions.length ?? 0;
    // 「未完成」= 作答记录里没有这道题；做过一次（对错不论）就算完成
    const todoAll = index ? index.allIds.filter((id) => progress.records[id] === undefined).length : 0;
    const todoKey = index ? index.keyIds.filter((id) => progress.records[id] === undefined).length : 0;
    // 错题池同口径（做错次数多于做对），再按是否划重点拆成两个池子
    const pending = Object.entries(progress.records).filter(([, r]) => r.wrong > r.right);
    const keyIds = new Set(index?.keyIds ?? []);
    return {
      answered,
      accuracy: attempts === 0 ? 0 : Math.round((totalRight / attempts) * 100),
      wrongPending: pending.length,
      wrongPendingKey: index ? pending.filter(([id]) => keyIds.has(id)).length : 0,
      starred: progress.stars.length,
      covered: total === 0 ? 0 : Math.round((answered / total) * 100),
      todoAll,
      todoKey,
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

  /** 从面板开考：先记下这套配比（下次沿用），再按它组卷 */
  const startExam = (mode: 'exam' | 'examKey', plan: ExamPlan) => {
    setExamPlan(plan);
    setExamSetup(null);
    go(mode, { plan });
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>党校结业考试 · 题库</p>
        <h1 className={styles.title}>把整套题库刷穿</h1>
        <p className={styles.lead}>
          全部 {total} 道题：填空、单选、多选、判断、简答、论述。
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

      <section className={styles.todo}>
        <div className={styles.todoHead}>
          <strong>还没练过的题</strong>
          <p>
            做过一次就算完成（对错不论）；要重刷做错的题走下面的「错题重刷」（分全部 / 重点两档）。
          </p>
        </div>
        <div className={styles.todoBtns}>
          <button
            type="button"
            className={`btn ${stats.todoAll > 0 ? 'btnPrimary' : ''} ${styles.todoBtn}`}
            disabled={stats.todoAll === 0}
            onClick={() => go('todo')}
          >
            全量未完成
            <span className={styles.todoCount}>{stats.todoAll > 0 ? stats.todoAll : '都练完了'}</span>
          </button>
          <button
            type="button"
            className={`btn ${styles.todoBtn}`}
            disabled={stats.todoKey === 0}
            onClick={() => go('todoKey')}
          >
            重点未完成
            <span className={styles.todoCount}>
              {keyTotal === 0 ? '暂无重点题' : stats.todoKey > 0 ? stats.todoKey : '都练完了'}
            </span>
          </button>
        </div>
      </section>

      {examSetup && (
        <ExamSetup
          key={examSetup}
          mode={examSetup}
          onClose={() => setExamSetup(null)}
          onStart={startExam}
        />
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
            <small>按手册原顺序（填空→选择→判断→简答→论述）从头过</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button type="button" className={styles.modeCard} onClick={() => setExamSetup('exam')}>
          <span className={styles.modeIcon}>⏱</span>
          <span className={styles.modeBody}>
            <strong>全题考试</strong>
            <small>从全部 {total} 道题里按配比组卷，题数可以逐题型调，60 分钟计时</small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button
          type="button"
          className={styles.modeCard}
          onClick={() => (keyTotal > 0 ? setExamSetup('examKey') : navigate('/import'))}
          disabled={keyTotal === 0}
        >
          <span className={`${styles.modeIcon} ${styles.modeIconTight}`}>⏱★</span>
          <span className={styles.modeBody}>
            <strong>重点考试</strong>
            <small>
              {keyTotal > 0
                ? `只在 ${keyTotal} 道重点题里抽，题数同样可调；某题型不够就按库存出`
                : '还没导入划重点——拖一份进来才有重点卷'}
            </small>
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
            <strong>错题重刷 · 全部</strong>
            <small>
              {stats.wrongPending > 0 ? `${stats.wrongPending} 道题还没吃透` : '还没有错题，先刷几道'}
            </small>
          </span>
          <span className={styles.modeArrow}>→</span>
        </button>

        <button
          type="button"
          className={styles.modeCard}
          onClick={() => go('wrongKey')}
          disabled={stats.wrongPendingKey === 0}
        >
          <span className={`${styles.modeIcon} ${styles.modeIconTight}`}>✗★</span>
          <span className={styles.modeBody}>
            <strong>错题重刷 · 重点</strong>
            <small>
              {keyTotal === 0
                ? '还没导入划重点——暂时没有重点错题'
                : stats.wrongPendingKey > 0
                  ? `只看重点题里的 ${stats.wrongPendingKey} 道错题`
                  : '重点题还没错过，去刷重点题'}
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
        <button type="button" className="btn" onClick={() => navigate('/recite')}>
          背题稿（整份题库一页看完）
        </button>
        <button type="button" className="btn" onClick={() => navigate('/import')}>
          换题库 / 补划重点
        </button>
        <button type="button" className="btn" onClick={() => navigate('/import')}>
          备份 / 恢复答题记录
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
