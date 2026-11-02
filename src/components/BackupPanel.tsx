import { useMemo, useRef, useState } from 'react';
import { backupFileName, summarizeProgress } from '../core/backup';
import type { BackupImportSummary } from '../core/backup';
import { useQuiz } from '../store/quiz';
import { downloadText } from '../utils/download';
import styles from './BackupPanel.module.css';

function kb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 备份与恢复：把答题情况（可选连题库）打包成一个 JSON 带走，换设备 / 换浏览器 / 清缓存前用。
 * 数据全在本机，所以这里只做「导出文件 / 读文件」，不联网。
 */
export function BackupPanel() {
  const index = useQuiz((s) => s.index);
  const progress = useQuiz((s) => s.progress);
  const exportBackupText = useQuiz((s) => s.exportBackupText);
  const importBackup = useQuiz((s) => s.importBackup);

  const [includeBank, setIncludeBank] = useState(true);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<BackupImportSummary | null>(null);
  const [exported, setExported] = useState<{ name: string; size: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(
    () => summarizeProgress(progress, index?.questions.length ?? 0),
    [progress, index],
  );

  // 体积按字节算（中文一个字三字节，用字符数会报小一半）
  const bankBytes = useMemo(
    () => (index ? new Blob([JSON.stringify(index.data)]).size : 0),
    [index],
  );
  const progressBytes = useMemo(() => new Blob([JSON.stringify(progress)]).size, [progress]);

  const doExport = () => {
    try {
      const text = exportBackupText({ includeBank });
      const name = backupFileName();
      downloadText(name, text);
      setExported({ name, size: new Blob([text]).size });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setImported(null);
    try {
      const text = await file.text();
      const summary = importBackup(text, { mode });
      setImported(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>备份与恢复</h2>
      <p className={styles.lead}>
        答题记录、错题、收藏、完成轮次、没刷完的那一轮全都存在<b>这台设备的浏览器</b>里。
        换设备、清缓存、重装之前导出一次，到新设备选「导入备份」就能接着刷。
        文件不经过任何服务器。
      </p>

      <div className={styles.stats}>
        <span>
          已答 <strong>{stats.answered}</strong> 题
        </span>
        <span>
          对 <strong>{stats.right}</strong> / 错 <strong>{stats.wrong}</strong>
        </span>
        <span>
          收藏 <strong>{stats.stars}</strong>
        </span>
        <span>
          完成 <strong>{stats.finishedSessions}</strong> 轮
        </span>
        <span>题库 {index ? `${index.questions.length} 题` : '未导入'}</span>
      </div>

      <div className={styles.row}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={includeBank}
            onChange={(e) => setIncludeBank(e.target.checked)}
          />
          连题库一起打包
          <small>
            {index
              ? `约 ${kb(bankBytes + progressBytes)}；不勾则只导出答题情况（约 ${kb(progressBytes)}）`
              : '本机还没有题库，只能导出答题情况'}
          </small>
        </label>
        <button type="button" className="btn btnPrimary" onClick={doExport}>
          导出备份
        </button>
      </div>
      {exported && (
        <p className={styles.ok}>
          已下载 <b>{exported.name}</b>（{kb(exported.size)}）。把这个文件拷到新设备，再回来导入。
        </p>
      )}

      <div className={styles.row}>
        <span className={styles.modeLabel}>导入方式：</span>
        <label className={styles.check}>
          <input
            type="radio"
            name="backup-mode"
            checked={mode === 'merge'}
            onChange={() => setMode('merge')}
          />
          合并
          <small>同一题的次数相加、收藏取并集。同一份备份导入两次会重复计入。</small>
        </label>
        <label className={styles.check}>
          <input
            type="radio"
            name="backup-mode"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
          />
          覆盖
          <small>清掉本机记录，完全以备份为准（从旧手机搬到新手机用这个）。</small>
        </label>
      </div>

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
          void takeFile(e.dataTransfer.files[0]);
        }}
      >
        <p className={styles.dropMain}>
          {busy ? '正在导入…' : '把备份 JSON 拖到这里，或点一下选文件'}
        </p>
        <p className={styles.dropHint}>只接受本应用导出的备份文件（.json）</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        data-backup-file="1"
        accept=".json,application/json"
        onChange={(e) => {
          void takeFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {error && <p className={styles.error}>{error}</p>}
      {imported && (
        <p className={styles.ok}>
          已{imported.mode === 'replace' ? '覆盖' : '合并'}：<b>{imported.records}</b> 道题有记录、
          <b>{imported.stars}</b> 个收藏、完成 <b>{imported.finishedSessions}</b> 轮
          {imported.bankImported ? `，题库已换成 ${imported.questionCount} 题` : ''}
          {imported.sessionResumed ? '，没刷完的那一轮也接上了' : ''}。
        </p>
      )}
    </section>
  );
}
