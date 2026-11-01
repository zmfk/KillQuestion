import { useRef, useState } from 'react';
import { useQuiz } from '../store/quiz';
import styles from './ImportPanel.module.css';

/** 题库不进仓库，所以第一次打开（或清空后）都要从这里导入。 */
export function ImportPanel() {
  const importBankText = useQuiz((s) => s.importBankText);
  const importError = useQuiz((s) => s.importError);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    setBusy(true);
    try {
      importBankText(await file.text());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>导入题库</h1>
        <p className={styles.lead}>
          这个应用本身不带题目。选择你的题库 JSON 文件（<code>KillQuestion-题库.json</code>
          ），导入后所有功能才可用；题库只存在这台设备的浏览器里，不会上传。
        </p>

        <button
          type="button"
          className="btn btnPrimary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? '读取中…' : '选择题库文件'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />

        <details className={styles.pasteBox}>
          <summary>或者直接粘贴 JSON</summary>
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

        {importError && <p className={styles.error}>导入失败：{importError}</p>}

        <p className={styles.hint}>
          换设备、换浏览器、清缓存都会丢题库和学习记录。固定用同一个访问地址，别混着用在线版和本地包。
        </p>
      </div>
    </div>
  );
}
