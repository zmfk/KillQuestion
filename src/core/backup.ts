/**
 * 备份文件的「打包 / 解包 / 合并」。
 *
 * 用户数据全在本机 localStorage 里，换设备（或清缓存）就没了，所以这里做一份可搬家的 JSON：
 * 答题记录、收藏、完成轮次、正在进行的练习，可选连题库一起带上。
 *
 * 这里只做纯数据：不碰 DOM、不读写 localStorage，由 store 决定写到哪、页面决定怎么下载。
 */
import type { BankData, Progress, QuestionRecord, Session } from '../types';

export const BACKUP_APP = 'killquestion';
export const BACKUP_KIND = 'backup';
export const BACKUP_VERSION = 1;

/** 备份里会给页面看的摘要，省得导入后还要自己数 */
export interface BackupStats {
  questionCount: number;
  answered: number;
  right: number;
  wrong: number;
  stars: number;
  finishedSessions: number;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  version: number;
  /** ISO 时间串，出问题时能对上是哪一份 */
  exportedAt: string;
  stats: BackupStats;
  progress: Progress;
  /** 不带题库时为 null：只搬家答题情况，题库在另一台设备上自己导入 */
  bank: BankData | null;
}

/** 导入完成后的回执，页面直接照着显示 */
export interface BackupImportSummary {
  mode: 'merge' | 'replace';
  /** 这份备份里带了题库、并且已经替换掉本机题库 */
  bankImported: boolean;
  questionCount: number;
  records: number;
  stars: number;
  finishedSessions: number;
  /** 备份里带的进行中练习是否被采纳（合并模式下以本机为准，通常为 false） */
  sessionResumed: boolean;
}

const MODES = new Set([
  'key',
  'all',
  'wrong',
  'wrongKey',
  'star',
  'topic',
  'exam',
  'examKey',
  'todo',
  'todoKey',
]);

/** 摘要：题数、答过多少、对错次数、收藏数、完成轮次 */
export function summarizeProgress(progress: Progress, questionCount = 0): BackupStats {
  const records = Object.values(progress.records ?? {});
  return {
    questionCount,
    answered: records.length,
    right: records.reduce((n, r) => n + (Number(r?.right) || 0), 0),
    wrong: records.reduce((n, r) => n + (Number(r?.wrong) || 0), 0),
    stars: (progress.stars ?? []).length,
    finishedSessions: Math.max(0, Math.floor(Number(progress.finishedSessions) || 0)),
  };
}

/** 组装一份备份。includeBank=false 时只带答题情况 */
export function buildBackup(
  bank: BankData | null,
  progress: Progress,
  includeBank: boolean,
  now: Date = new Date(),
): BackupFile {
  const withBank = includeBank && bank ? bank : null;
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    stats: summarizeProgress(progress, withBank?.questions?.length ?? 0),
    progress,
    bank: withBank,
  };
}

/** 下载文件名：带日期与时分，导出多份也认得出先后 */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
  return `KillQuestion-备份-${stamp}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRecord(raw: unknown): QuestionRecord | null {
  if (!isRecord(raw)) return null;
  const right = Number(raw.right);
  const wrong = Number(raw.wrong);
  if (!Number.isFinite(right) || !Number.isFinite(wrong)) return null;
  const lastAt = Number(raw.lastAt);
  return {
    right: Math.max(0, Math.floor(right)),
    wrong: Math.max(0, Math.floor(wrong)),
    lastAt: Number.isFinite(lastAt) ? lastAt : 0,
  };
}

function normalizeSession(raw: unknown): Session | null {
  if (!isRecord(raw)) return null;
  const queue = raw.queue;
  if (!Array.isArray(queue) || queue.some((id) => typeof id !== 'string')) return null;
  const mode = typeof raw.mode === 'string' && MODES.has(raw.mode) ? raw.mode : null;
  if (mode === null) return null;
  const index = Number(raw.index);
  if (!Number.isFinite(index) || index < 0) return null;
  const results = Array.isArray(raw.results) ? raw.results : [];
  return {
    mode: mode as Session['mode'],
    topicId: typeof raw.topicId === 'string' ? raw.topicId : undefined,
    label: typeof raw.label === 'string' ? raw.label : '练习',
    queue,
    index: Math.floor(index),
    // 结果明细只用于结算页，结构不对就丢掉，不影响主数据
    results: results.filter(isRecord).map((r) => ({
      questionId: String(r.questionId ?? ''),
      correct: r.correct === true,
      picked: Array.isArray(r.picked) ? r.picked.map((p) => String(p)) : [],
      at: Number(r.at) || 0,
      ...(Number.isFinite(Number(r.score)) ? { score: Number(r.score) } : {}),
    })),
    startedAt: Number(raw.startedAt) || 0,
    endsAt: raw.endsAt === null || raw.endsAt === undefined ? null : Number(raw.endsAt) || null,
  };
}

/**
 * 把任意来源的进度收拾成合法结构。坏掉的记录直接丢掉，而不是整份拒绝：
 * 备份能救回多少是多少，总比因为一条脏数据全都导不进去强。
 */
export function normalizeProgress(raw: unknown): Progress {
  const source = isRecord(raw) ? raw : {};
  const records: Record<string, QuestionRecord> = {};
  if (isRecord(source.records)) {
    for (const [id, value] of Object.entries(source.records)) {
      const record = normalizeRecord(value);
      if (record) records[id] = record;
    }
  }
  const stars = Array.isArray(source.stars)
    ? Array.from(new Set(source.stars.filter((s): s is string => typeof s === 'string')))
    : [];
  const lastStudyAt = Number(source.lastStudyAt);
  return {
    records,
    stars,
    session: normalizeSession(source.session),
    finishedSessions: Math.max(0, Math.floor(Number(source.finishedSessions) || 0)),
    lastStudyAt: Number.isFinite(lastStudyAt) && lastStudyAt > 0 ? lastStudyAt : null,
  };
}

/**
 * 解析备份文本。
 *
 * 认两种输入：带 `app/kind` 头的正式备份，以及裸的 `{ records, stars }` 进度对象
 * （早期版本有可能手工存过这种）。其余一律抛错，错误信息直接给用户看。
 */
export function parseBackupText(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('这不是 JSON 文件，选错了？');
  }
  if (!isRecord(raw)) throw new Error('备份文件格式不对：顶层应该是一个对象');
  if (typeof raw.app === 'string' && raw.app !== BACKUP_APP) {
    throw new Error(`这份文件来自「${raw.app}」，不是 KillQuestion 的备份`);
  }
  const hasProgress = isRecord(raw.progress) || isRecord(raw.records);
  if (!hasProgress) throw new Error('备份里没有找到答题记录（progress / records）');

  const progressRaw = isRecord(raw.progress) ? raw.progress : raw;
  const progress = normalizeProgress(progressRaw);
  const bank =
    isRecord(raw.bank) && Array.isArray(raw.bank.questions)
      ? (raw.bank as unknown as BankData)
      : null;

  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: Number(raw.version) || BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    stats: summarizeProgress(progress, bank?.questions?.length ?? 0),
    progress,
    bank,
  };
}

/**
 * 合并两份进度：同一道题的次数相加、收藏取并集、完成轮次相加、最后学习时间取较晚的。
 *
 * 注意这会「累加」：同一份备份连导两次，次数会翻倍。想严格对齐某台设备就用覆盖模式。
 */
export function mergeProgress(local: Progress, incoming: Progress): Progress {
  const records: Record<string, QuestionRecord> = { ...local.records };
  for (const [id, add] of Object.entries(incoming.records)) {
    const prev = records[id];
    records[id] = prev
      ? {
          right: prev.right + add.right,
          wrong: prev.wrong + add.wrong,
          lastAt: Math.max(prev.lastAt, add.lastAt),
        }
      : { ...add };
  }
  return {
    records,
    stars: Array.from(new Set([...(local.stars ?? []), ...(incoming.stars ?? [])])),
    // 正在进行的练习以本机为准：那是这台设备上真实没刷完的那一轮
    session: local.session ?? incoming.session,
    finishedSessions: (local.finishedSessions ?? 0) + (incoming.finishedSessions ?? 0),
    lastStudyAt: Math.max(local.lastStudyAt ?? 0, incoming.lastStudyAt ?? 0) || null,
  };
}
