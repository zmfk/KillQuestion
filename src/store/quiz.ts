import { create } from 'zustand';
import { autoGrade } from '../core/grade';
import { mulberry32 } from '../core/rng';
import { shuffle } from '../core/shuffle';
import { indexBank, validateBank } from '../data/bank';
import type { BankIndex } from '../data/bank';
import type { BankData, PracticeMode, Progress, Question, ResultItem, Session } from '../types';

const PROGRESS_KEY = 'killquestion.progress.v1';
const BANK_KEY = 'killquestion.bank.v1';
const EXAM_MINUTES = 60;
/** 考试卷按原卷结构配比抽题 */
const EXAM_PLAN: Record<string, number> = { fill: 10, single: 20, multi: 1, short: 3, essay: 3 };

function emptyProgress(): Progress {
  return { records: {}, stars: [], session: null, finishedSessions: 0, lastStudyAt: null };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 配额不足时静默降级为「本次有效」
  }
}

const TYPE_ORDER: Record<string, number> = { fill: 0, single: 1, multi: 2, short: 3, essay: 4 };

export function modeLabel(mode: PracticeMode, topicTitle?: string): string {
  switch (mode) {
    case 'key':
      return '重点刷题';
    case 'all':
      return '全量刷题';
    case 'wrong':
      return '错题重刷';
    case 'star':
      return '收藏夹';
    case 'exam':
      return '模拟考试';
    case 'topic':
      return topicTitle ? `考点 · ${topicTitle}` : '考点练习';
    default:
      return '练习';
  }
}

interface QuizState {
  index: BankIndex | null;
  importError: string | null;
  progress: Progress;
  session: Session | null;
  current: Question | null;
  picked: string[];
  fillInputs: string[];
  submitted: boolean;
  lastCorrect: boolean | null;
  awaitingSelfAssess: boolean;
  booted: boolean;

  boot: () => void;
  importBankText: (text: string) => void;
  clearBank: () => void;
  start: (mode: PracticeMode, opts?: { topicId?: string; ordered?: boolean }) => boolean;
  togglePick: (key: string) => void;
  setFill: (index: number, value: string) => void;
  submit: () => void;
  selfAssess: (correct: boolean) => void;
  next: () => void;
  finish: () => void;
  toggleStar: (id: string) => void;
  resetAll: () => void;
}

export const useQuiz = create<QuizState>((set, get) => {
  const commit = (patch: Partial<Progress>) => {
    const progress = { ...get().progress, ...patch };
    writeJson(PROGRESS_KEY, progress);
    set({ progress });
  };

  const saveSession = (session: Session | null) => {
    commit({ session });
    set({ session });
  };

  const loadCurrent = (session: Session | null, index: BankIndex | null) => {
    if (!session || !index || session.index >= session.queue.length) {
      set({ current: null });
      return;
    }
    const q = index.questionById.get(session.queue[session.index]) ?? null;
    set({
      current: q,
      picked: [],
      fillInputs:
        q && q.type === 'fill' ? new Array(q.blanks ?? q.answer?.length ?? 1).fill('') : [],
      submitted: false,
      lastCorrect: null,
      awaitingSelfAssess: false,
    });
  };

  const buildPool = (
    mode: PracticeMode,
    index: BankIndex,
    progress: Progress,
    topicId: string | undefined,
    ordered: boolean,
  ): string[] => {
    let ids: string[];
    switch (mode) {
      case 'key':
        ids = [...index.keyIds];
        break;
      case 'all':
        ids = [...index.allIds];
        break;
      case 'wrong':
        ids = index.questions
          .filter((q) => {
            const r = progress.records[q.id];
            return r !== undefined && r.wrong > r.right;
          })
          .map((q) => q.id);
        break;
      case 'star':
        ids = progress.stars.filter((id) => index.questionById.has(id));
        break;
      case 'topic':
        ids = index.questions
          .filter((q) => (topicId ? q.topicIds.includes(topicId) : false))
          .map((q) => q.id);
        break;
      case 'exam': {
        const rng = mulberry32(Date.now() >>> 0);
        const picked: string[] = [];
        for (const [type, count] of Object.entries(EXAM_PLAN)) {
          const bucket = index.questions.filter((q) => q.type === type).map((q) => q.id);
          picked.push(...shuffle(bucket, rng).slice(0, count));
        }
        return picked
          .slice()
          .sort((a, b) => {
            const qa = index.questionById.get(a);
            const qb = index.questionById.get(b);
            const ta = TYPE_ORDER[qa?.type ?? ''] ?? 9;
            const tb = TYPE_ORDER[qb?.type ?? ''] ?? 9;
            if (ta !== tb) return ta - tb;
            return (qa?.no ?? 0) - (qb?.no ?? 0);
          });
      }
      default:
        ids = [...index.allIds];
    }
    if (ordered) return ids;
    return shuffle(ids, mulberry32((Date.now() ^ ids.length) >>> 0));
  };

  return {
    index: null,
    importError: null,
    progress: emptyProgress(),
    session: null,
    current: null,
    picked: [],
    fillInputs: [],
    submitted: false,
    lastCorrect: null,
    awaitingSelfAssess: false,
    booted: false,

    boot: () => {
      if (get().booted) return;
      const progress = { ...emptyProgress(), ...(readJson<Progress>(PROGRESS_KEY) ?? {}) };
      const rawBank = readJson<BankData>(BANK_KEY);
      let index: BankIndex | null = null;
      if (rawBank) {
        try {
          index = indexBank(validateBank(rawBank));
        } catch {
          index = null;
        }
      }
      set({ progress, index, booted: true });
      if (index && progress.session) {
        set({ session: progress.session });
        loadCurrent(progress.session, index);
      }
    },

    importBankText: (text) => {
      try {
        const parsed = validateBank(JSON.parse(text));
        const index = indexBank(parsed);
        writeJson(BANK_KEY, parsed);
        const progress = { ...emptyProgress(), ...(readJson<Progress>(PROGRESS_KEY) ?? {}) };
        set({ index, importError: null, progress, session: progress.session });
        if (progress.session) loadCurrent(progress.session, index);
      } catch (err) {
        set({
          importError: err instanceof Error ? err.message : String(err),
        });
      }
    },

    clearBank: () => {
      try {
        localStorage.removeItem(BANK_KEY);
        localStorage.removeItem(PROGRESS_KEY);
      } catch {
        /* ignore */
      }
      set({
        index: null,
        progress: emptyProgress(),
        session: null,
        current: null,
        importError: null,
      });
    },

    start: (mode, opts) => {
      const index = get().index;
      if (!index) return false;
      const topicId = opts?.topicId;
      const pool = buildPool(mode, index, get().progress, topicId, opts?.ordered ?? mode === 'exam');
      if (pool.length === 0) return false;
      const topicTitle = topicId ? index.topicById.get(topicId)?.title : undefined;
      const session: Session = {
        mode,
        topicId,
        label: modeLabel(mode, topicTitle),
        queue: pool,
        index: 0,
        results: [],
        startedAt: Date.now(),
        endsAt: mode === 'exam' ? Date.now() + EXAM_MINUTES * 60_000 : null,
      };
      saveSession(session);
      loadCurrent(session, index);
      return true;
    },

    togglePick: (key) => {
      const { current, picked, submitted } = get();
      if (!current || submitted) return;
      if (current.type === 'single') {
        set({ picked: [key] });
        return;
      }
      set({ picked: picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key] });
    },

    setFill: (index, value) => {
      const next = get().fillInputs.slice();
      next[index] = value;
      set({ fillInputs: next });
    },

    submit: () => {
      const { current, picked, fillInputs, submitted } = get();
      if (!current || submitted) return;
      if ((current.type === 'single' || current.type === 'multi') && picked.length === 0) return;
      if (current.type === 'fill' && fillInputs.every((v) => v.trim() === '')) return;

      const verdict = autoGrade(current, current.type === 'fill' ? fillInputs : picked);
      if (verdict === null) {
        set({ submitted: true, awaitingSelfAssess: true, lastCorrect: null });
        return;
      }
      const item: ResultItem = {
        questionId: current.id,
        correct: verdict,
        picked: current.type === 'fill' ? fillInputs.slice() : picked.slice(),
        at: Date.now(),
      };
      const progress = get().progress;
      const prev = progress.records[item.questionId] ?? { right: 0, wrong: 0, lastAt: 0 };
      const session = get().session;
      commit({
        records: {
          ...progress.records,
          [item.questionId]: {
            right: prev.right + (verdict ? 1 : 0),
            wrong: prev.wrong + (verdict ? 0 : 1),
            lastAt: item.at,
          },
        },
        lastStudyAt: item.at,
        ...(session ? { session: { ...session, results: [...session.results, item] } } : {}),
      });
      if (session) set({ session: { ...session, results: [...session.results, item] } });
      set({ submitted: true, lastCorrect: verdict, awaitingSelfAssess: false });
    },

    selfAssess: (correct) => {
      const { current, awaitingSelfAssess } = get();
      if (!current || !awaitingSelfAssess) return;
      const item: ResultItem = { questionId: current.id, correct, picked: [], at: Date.now() };
      const progress = get().progress;
      const prev = progress.records[item.questionId] ?? { right: 0, wrong: 0, lastAt: 0 };
      const session = get().session;
      const nextSession = session
        ? { ...session, results: [...session.results, item] }
        : null;
      commit({
        records: {
          ...progress.records,
          [item.questionId]: {
            right: prev.right + (correct ? 1 : 0),
            wrong: prev.wrong + (correct ? 0 : 1),
            lastAt: item.at,
          },
        },
        lastStudyAt: item.at,
        ...(nextSession ? { session: nextSession } : {}),
      });
      if (nextSession) set({ session: nextSession });
      set({ awaitingSelfAssess: false, lastCorrect: correct });
    },

    next: () => {
      const session = get().session;
      const index = get().index;
      if (!session) return;
      const nextSession: Session = { ...session, index: session.index + 1 };
      saveSession(nextSession);
      loadCurrent(nextSession, index);
    },

    finish: () => {
      const session = get().session;
      if (!session) return;
      const progress = get().progress;
      const done: Session = { ...session, index: session.queue.length };
      commit({ session: done, finishedSessions: progress.finishedSessions + 1 });
      set({ current: null });
    },

    toggleStar: (id) => {
      const stars = get().progress.stars;
      commit({ stars: stars.includes(id) ? stars.filter((x) => x !== id) : [...stars, id] });
    },

    resetAll: () => {
      const progress = emptyProgress();
      writeJson(PROGRESS_KEY, progress);
      set({ progress, session: null, current: null });
    },
  };
});
