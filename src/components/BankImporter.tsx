import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AI_PROMPT, AI_STEPS, AI_WARNINGS, promptStats } from '../core/aiPrompt';
import { buildBank } from '../core/buildBank';
import type { BuildOptions, BuildResult } from '../core/buildBank';
import { extractText, fileKind } from '../core/extract';
import { parseBankText } from '../core/parseBank';
import { parseTopicsText } from '../core/parseTopics';
import { validateBank } from '../data/bank';
import type { BankIndex } from '../data/bank';
import type { BankData, Topic } from '../types';
import { useQuiz } from '../store/quiz';
import styles from './BankImporter.module.css';

type SlotKind = 'bank' | 'topics' | 'unknown';

interface Slot {
  name: string;
  kind: SlotKind;
  text: string;
  note: string;
  /** JSON 题库解析出来的成品 */
  data?: BankData;
  /** JSON 形式的考点表 */
  topics?: Topic[];
}

const KIND_LABEL: Record<SlotKind, string> = {
  bank: '题库',
  topics: '划重点',
  unknown: '没认出来',
};

const TYPE_LABEL: Record<string, string> = {
  fill: '填空',
  single: '单选',
  multi: '多选',
  short: '简答',
  essay: '论述',
};

function fileTitle(name: string): string {
  return name.replace(/\.(pdf|docx|txt|md|markdown|json)$/i, '').slice(0, 60) || '题库';
}

/** 文本类：先当题库试着解析，不行再当划重点；两样都不像就说明文件不对 */
function classifyText(text: string): { kind: SlotKind; note: string } {
  const bank = parseBankText(text);
  if (bank.sections.length > 0 && bank.questions.length > 0) {
    return { kind: 'bank', note: `${bank.questions.length} 题 · ${bank.sections.join(' / ')}` };
  }
  const topics = parseTopicsText(text);
  if (topics.topics.length >= 3) {
    return { kind: 'topics', note: `${topics.topics.length} 个考点 · ${topics.sections.length} 组` };
  }
  return { kind: 'unknown', note: '既没读到「一、填空题」这类小节，也没读到考点清单' };
}

/** JSON 类：认题库（questions）也认纯考点表（topics），两种都能和别的文件混着用 */
function classifyJson(text: string): { kind: SlotKind; note: string; data?: BankData; topics?: Topic[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'unknown', note: '这个 .json 不是合法 JSON' };
  }
  const obj = (raw ?? {}) as Partial<BankData>;
  if (Array.isArray(obj.questions) && obj.questions.length > 0) {
    try {
      const data = validateBank(raw);
      return {
        kind: 'bank',
        note: `${data.questions.length} 题${data.topics.length > 0 ? ` · ${data.topics.length} 个考点` : ''} · JSON`,
        data,
      };
    } catch (err) {
      return { kind: 'unknown', note: `JSON 结构不对：${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (Array.isArray(obj.topics) && obj.topics.length > 0) {
    return { kind: 'topics', note: `${obj.topics.length} 个考点 · JSON`, topics: obj.topics };
  }
  return { kind: 'unknown', note: 'JSON 里既没有 questions 也没有 topics' };
}

function derive(
  slots: Slot[],
  existing: BankIndex | null,
): { built?: BuildResult; error?: string } {
  const bankSlot = slots.find((s) => s.kind === 'bank');
  const topicsSlot = slots.find((s) => s.kind === 'topics');
  if (!bankSlot && !topicsSlot) {
    if (slots.length > 0) {
      return {
        error:
          '这几个文件都没认出来。题库要能读到「一、填空题 / 二、选择题 / 三、简答题 / 四、论述题」这类小节；' +
          '划重点是「一、分组 + 一行一条考点」；JSON 里要有 questions 或 topics。' +
          '扫描版 PDF（整页是图片、选不中文字）读不出来，先用 OCR 转成文字版。',
      };
    }
    return {};
  }

  const bankData = bankSlot?.data;
  const topicsText = topicsSlot?.text ?? '';
  const topicsData = topicsSlot?.topics;

  const withTopics = (opts: BuildOptions): BuildOptions => ({
    ...opts,
    ...(topicsText.trim() ? { topicsText } : {}),
    ...(topicsData && topicsData.length > 0 ? { existingTopics: topicsData } : {}),
  });

  try {
    // 一、题库 JSON：自带考点就原样保留；另拖了划重点才重标
    if (bankData) {
      const wantsRetag = Boolean(topicsSlot);
      const opts = withTopics({
        existingQuestions: bankData.questions,
        title: fileTitle(bankSlot?.name ?? '题库'),
        ...(wantsRetag ? { retag: true } : {}),
      });
      if (!wantsRetag && bankData.topics.length > 0) opts.existingTopics = bankData.topics;
      return { built: buildBank(opts) };
    }

    // 二、PDF / DOCX / TXT：解析题目
    if (bankSlot?.text) {
      return {
        built: buildBank(
          withTopics({ bankText: bankSlot.text, title: fileTitle(bankSlot.name) }),
        ),
      };
    }

    // 三、只给了划重点：把本机已有的题库重标一遍
    if (topicsSlot && existing) {
      return {
        built: buildBank(
          withTopics({
            existingQuestions: existing.questions,
            retag: true,
            title: existing.data.meta.title,
          }),
        ),
      };
    }

    return { error: '只认出了划重点文件，还缺题库本身（PDF / DOCX / 题库 JSON）。' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BankImporter({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const index = useQuiz((s) => s.index);
  const importBankData = useQuiz((s) => s.importBankData);
  const importBankText = useQuiz((s) => s.importBankText);
  const importError = useQuiz((s) => s.importError);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  /** 复制提示词：先用剪贴板 API，不行就退回「选中 + execCommand」 */
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
    } catch {
      const node = promptRef.current;
      if (!node) return;
      node.focus();
      node.select();
      setCopied(document.execCommand('copy'));
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  const { built, error } = useMemo(() => derive(slots, index), [slots, index]);

  const takeFiles = async (list: FileList | File[]) => {
    const files = Array.from(list).slice(0, 6);
    if (files.length === 0) return;
    setBusy(true);
    setProgress('');
    const added: Slot[] = [];
    for (const file of files) {
      const kind = fileKind(file.name);
      if (kind === 'unsupported') {
        added.push({
          name: file.name,
          kind: 'unknown',
          text: '',
          note: '不支持这种格式；.doc 请先另存为 .docx',
        });
        continue;
      }
      try {
        if (kind === 'json') {
          const text = await file.text();
          const verdict = classifyJson(text);
          added.push({ name: file.name, text, ...verdict });
          continue;
        }
        setProgress(`正在读 ${file.name}`);
        const extracted = await extractText(file, (done, total) => {
          setProgress(`正在读 ${file.name}：第 ${done} / ${total} 页`);
        });
        const verdict = classifyText(extracted.text);
        added.push({
          name: file.name,
          kind: verdict.kind,
          text: extracted.text,
          note: `${verdict.note} · ${extracted.units} ${extracted.kind === 'pdf' ? '页' : '行'}`,
        });
      } catch (err) {
        added.push({
          name: file.name,
          kind: 'unknown',
          text: '',
          note: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setProgress('');
    setBusy(false);
    setSlots((prev) => {
      // 同类文件只留最后一份，免得把两版题库混成一份
      const kept = prev.filter((p) => !added.some((a) => a.kind === p.kind));
      return [...kept, ...added].slice(-6);
    });
  };

  const doImport = () => {
    if (!built) return;
    importBankData(built.data);
    if (useQuiz.getState().importError) return;
    navigate('/');
  };

  return (
    <div className={styles.wrap}>
      {!compact && <h1 className={styles.title}>导入题库</h1>}
      <p className={styles.lead}>
        直接把 <strong>PDF</strong>、<strong>Word（.docx）</strong> 或<strong>题库 JSON</strong> 拖进来就行，
        在你这台设备上解析，不上传任何服务器。题库和划重点可以一起拖：
        题库出题，划重点决定「重点刷题」的范围。
      </p>

      <div
        className={`${styles.drop} ${dragging ? styles.dropActive : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void takeFiles(e.dataTransfer.files);
        }}
      >
        <p className={styles.dropMain}>
          {busy ? progress || '处理中…' : '把文件拖到这里，或点一下选文件'}
        </p>
        <p className={styles.dropHint}>
          支持 .pdf / .docx / .json / .txt · 可一次选多个 · 旧版 .doc 请先另存为 .docx
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.json,.txt,.md,application/pdf,application/json"
        onChange={(e) => {
          if (e.target.files) void takeFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {slots.length > 0 && (
        <ul className={styles.slots}>
          {slots.map((slot) => (
            <li key={slot.name} className={styles.slot}>
              <span
                className={[
                  styles.tag,
                  slot.kind === 'bank' ? styles.tagBank : '',
                  slot.kind === 'topics' ? styles.tagTopics : '',
                  slot.kind === 'unknown' ? styles.tagBad : '',
                ].join(' ')}
              >
                {KIND_LABEL[slot.kind]}
              </span>
              <span className={styles.slotName}>{slot.name}</span>
              <span className={styles.tag}>{slot.note}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {built && (
        <div className={styles.preview}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statNum}>{built.report.total}</span>
              <span className={styles.statLabel}>道题</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{built.report.topicCount}</span>
              <span className={styles.statLabel}>个考点</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>
                {built.report.tagged}
                <small> / {built.report.total}</small>
              </span>
              <span className={styles.statLabel}>重点题</span>
            </div>
          </div>
          <p className={styles.typeLine}>
            {Object.entries(built.report.counters)
              .filter(([, n]) => n > 0)
              .map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`)
              .join(' · ') || '没有识别到题型'}
          </p>

          {built.report.warnings.length > 0 && (
            <ul className={styles.warn}>
              {built.report.warnings.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div className={styles.actions}>
            <button type="button" className="btn btnPrimary" onClick={doImport}>
              写入本机，开始刷
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => download('KillQuestion-题库.json', JSON.stringify(built.data, null, 1))}
            >
              导出成 JSON
            </button>
            <button type="button" className="btn" onClick={() => setSlots([])}>
              重选文件
            </button>
          </div>
        </div>
      )}

      {importError && <p className={styles.error}>导入失败：{importError}</p>}
      {index && (
        <p className={styles.hint}>
          本机已有 {index.questions.length} 道题。再拖一份<strong>题库</strong>会整份替换（作答记录一起清掉，避免题号和记录错位）；
          只拖<strong>划重点</strong>则只重新标注，题目和记录都不动。
        </p>
      )}

      <details className={styles.paste}>
        <summary>读不出来 / 想更稳？用 AI 把资料转成 JSON</summary>
        <p className={styles.hint}>
          扫描件（整页是图片）、双栏乱序、表格排版的书，内置解析会失手。这种时候让大模型按固定格式吐
          JSON，再粘回来就能导入——题库照样只存在你自己这台设备上。
        </p>
        <ol className={styles.steps}>
          {AI_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className={styles.promptHead}>
          <strong>给 AI 的提示词</strong>
          <span className={styles.promptMeta}>{promptStats().chars} 字 · 末尾贴资料</span>
          <button type="button" className="btn" onClick={() => void copyPrompt()}>
            {copied ? '已复制 ✓' : '复制提示词'}
          </button>
        </div>
        <textarea
          ref={promptRef}
          className="textarea"
          rows={9}
          readOnly
          value={AI_PROMPT}
          spellCheck={false}
        />
        <ul className={styles.warn}>
          {AI_WARNINGS.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </details>

      <details className={styles.paste}>
        <summary>AI 转出来的 JSON / 已有题库 JSON，粘在这里</summary>
        <textarea
          className="textarea"
          rows={5}
          placeholder='{"version":1,"questions":[…]}'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={pasted.trim() === ''}
          onClick={() => importBankText(pasted)}
        >
          导入粘贴的内容
        </button>
      </details>

      <p className={styles.hint}>
        换设备、换浏览器、清缓存都会丢题库和学习记录。固定用同一个访问地址，别混着用在线版和本地包。
      </p>
    </div>
  );
}
