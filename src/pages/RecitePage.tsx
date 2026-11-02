import { useMemo, useState } from 'react';
import { ImportPanel } from '../components/ImportPanel';
import { answerLine, buildReciteText, groupQuestions, groupTopics } from '../core/reciteText';
import { useQuiz } from '../store/quiz';
import styles from './RecitePage.module.css';

/**
 * 背题页：把整份题库摊成一页纯文字，考点在前、题目在后，可以直接读、直接打印。
 *
 * 和「刷题」的区别：这里没有作答、没有判分，只有原文和答案本身——
 * 考前最后一晚从头扫一遍用的，或者打印出来在纸上背。
 */
export function RecitePage() {
  const index = useQuiz((s) => s.index);
  const [onlyKey, setOnlyKey] = useState(false);
  const [hideAnswer, setHideAnswer] = useState(false);
  const [withTopics, setWithTopics] = useState(true);
  const [copied, setCopied] = useState(false);

  const keyIds = useMemo(() => new Set(index?.keyIds ?? []), [index]);

  const groups = useMemo(
    () => (index ? groupQuestions(index.questions, onlyKey, keyIds) : []),
    [index, onlyKey, keyIds],
  );

  const topicGroups = useMemo(() => (index ? groupTopics(index.topics) : []), [index]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.questions.length, 0), [groups]);

  /**
   * 论述题的材料常常被多道题共用，逐题印一遍会把版面撑散：只在他第一次出现的地方印。
   * 用预计算而不是渲染时打标记——渲染函数里改外部 Set，遇到 StrictMode 的双次渲染会错位。
   */
  const materialOwners = useMemo(() => {
    const seen = new Set<string>();
    const owners = new Set<string>();
    for (const g of groups) {
      for (const q of g.questions) {
        const m = q.material ?? '';
        if (m === '' || seen.has(m)) continue;
        seen.add(m);
        owners.add(q.id);
      }
    }
    return owners;
  }, [groups]);

  if (!index) return <ImportPanel />;

  const text = () =>
    buildReciteText(index.data, { onlyKey, hideAnswer, withTopics, keyIds });

  const copyAll = async () => {
    const body = text();
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      setCopied(false);
      // 剪贴板被浏览器拦了（非 https 或没给权限）：退回让用户自己选中复制
      window.prompt('复制下面这段（Ctrl+C）：', body.slice(0, 20000));
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([text()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${index.data.meta?.title || '题库'}-背题稿.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>背题</h1>
        <p className="hint">
          整份题库摊在这一页上：考点在前，题目按 填空 → 选择 → 判断 → 简答 → 论述 排。
          {index.topics.length === 0 && ' 还没有划重点，所以只有题目、没有考点清单。'}
        </p>

        <div className={styles.toolbar}>
          <button type="button" className="btn btnPrimary" onClick={() => window.print()}>
            打印 / 存 PDF
          </button>
          <button type="button" className="btn" onClick={() => void copyAll()}>
            {copied ? '已复制 ✓' : '复制全文'}
          </button>
          <button type="button" className="btn" onClick={download}>
            下载 .txt
          </button>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={hideAnswer}
              onChange={(e) => setHideAnswer(e.target.checked)}
            />
            遮住答案
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} />
            只看重点
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={withTopics}
              onChange={(e) => setWithTopics(e.target.checked)}
            />
            带考点清单
          </label>
        </div>

        <p className={styles.meta}>
          {index.data.meta?.title || '题库'} · {total} 题
          {withTopics && index.topics.length > 0 ? ` · ${index.topics.length} 个考点` : ''}
          {onlyKey ? ' · 只看重点' : ''}
        </p>
      </header>

      {withTopics && index.topics.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>一、考点清单</h2>
          {topicGroups.map((group) => (
            <div key={group.section} className={styles.topicGroup}>
              <h3 className={styles.groupTitle}>{group.section}</h3>
              <ul className={styles.topicList}>
                {group.topics.map((t) => (
                  <li key={t.id} className={styles.topicItem}>
                    <span className={styles.topicName}>{t.title}</span>
                    <span className={styles.topicCount}>
                      {t.count > 0 ? `${t.count} 题` : '题库暂未收录'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>
          {withTopics && index.topics.length > 0 ? '二' : '一'}、全部题目
        </h2>

        {groups.length === 0 && (
          <p className="hint">
            {onlyKey ? '这份题库还没有划过重点，去掉「只看重点」就能看到全部题目。' : '题库里没有题目。'}
          </p>
        )}

        {groups.map((group) => (
          <div key={group.section} className={styles.group}>
            <h3 className={styles.groupTitle}>
              【{group.title}】<small>共 {group.questions.length} 题</small>
            </h3>

            {group.questions.map((q, i) => {
              const material = q.material ?? '';
              return (
                <article key={q.id} className={styles.item}>
                  {material !== '' && (
                    <div className={styles.material}>
                      {materialOwners.has(q.id) ? (
                        <>
                          <span className={styles.materialTag}>材料</span>
                          {material.split('\n').map((line, k) => (
                            <p key={k}>{line}</p>
                          ))}
                        </>
                      ) : (
                        <span className={styles.materialTag}>材料同上</span>
                      )}
                    </div>
                  )}

                  <p className={styles.stem}>
                    <span className={styles.no}>{q.no || i + 1}.</span>
                    {q.stem}
                  </p>

                  {q.options && q.options.length > 0 && (
                    <ul className={styles.options}>
                      {q.options.map((o) => {
                        const right = (q.answer ?? []).includes(o.key);
                        return (
                          <li key={o.key} className={right && !hideAnswer ? styles.rightOpt : ''}>
                            <b>{o.key}.</b> {o.text}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <p className={styles.answer}>
                    <span className={styles.answerTag}>答案</span>
                    {hideAnswer ? <span className={styles.covered}>先自己回想，再看答案</span> : answerLine(q)}
                  </p>
                </article>
              );
            })}
          </div>
        ))}
      </section>

      <p className={styles.tail}>
        题目标注「题库暂未收录」= 划重点里列了这一条，但题库原文里没有对应题目。
        背诵以原文为准，本页只做重排，不改写任何内容。
      </p>
    </div>
  );
}
