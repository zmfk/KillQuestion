import { create } from 'zustand';
import { gradeEssayAnswer } from '../core/answerMatch';
import type { EssayVerdict } from '../core/answerMatch';
import { autoGrade } from '../core/grade';
import { mulberry32 } from '../core/rng';
import { freshSeed, shuffle, shuffleChoiceOptions } from '../core/shuffle';
import { indexBank, validateBank } from '../data/bank';
import type { BankIndex } from '../data/bank';
import type { BankData, PracticeMode, Progress, Question, ResultItem, Session } from '../types';

const PROGRESS_KEY = 'killquestion.progress.v1';
const BANK_KEY = 'killquestion.bank.v1';
const EXAM_MINUTES = 60;
/** 考试卷按原卷结构配比抽题（附件 3 的试题结构含判断题，分值未公布，按常见卷面配） */
const EXAM_PLAN: Record<string, number> = { fill: 10, single: 20, multi: 1, judge: 10, short: 3, essay: 3 };

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

const TYPE_ORDER: Record<string, number> = { fill: 0, single: 1, multi: 2, judge: 3, short: 4, essay: 5 };

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
  /** 简答 / 论述的作答输入（切换题目时清空） */
  essayInput: string;
  submitted: boolean;
  lastCorrect: boolean | null;
  awaitingSelfAssess: boolean;
  /** 简答 / 论述的自动对照结果；没答案或没写东西时为 null（走自评） */
  essayVerdict: EssayVerdict | null;
  booted: boolean;

  boot: () => void;
  importBankText: (text: string) => void;
  /** 解析好的题库直接灌进来（PDF/DOCX 转换走这条路） */
  importBankData: (data: BankData, opts?: { keepProgress?: boolean }) => void;
  /** 把当前题库导出成 JSON 文本，便于备份或换设备 */
  exportBankJson: () => string | null;
  clearBank: () => void;
  start: (mode: PracticeMode, opts?: { topicId?: string; ordered?: boolean }) => boolean;
  togglePick: (key: string) => void;
  setFill: (index: number, value: string) => void;
  setEssay: (text: string) => void;
  submit: () => void;
  selfAssess: (correct: boolean) => void;
  /** 推翻简答 / 论述的自动对照结果（词面匹配只是参照，人说了算） */
  reviseEssay: (correct: boolean) => void;
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

  /**
   * 出一道题前的「上桌版」：选择题的选项每次重新打乱，字母按新位置重编，答案同步。
   * 返回的是副本，题库索引里的原题（背题稿、题库页、导出）保持原顺序不动。
   */
  const presentQuestion = (q: Question): Question => {
    if ((q.type !== 'single' && q.type !== 'multi') || (q.options?.length ?? 0) < 2) return q;
    const { options, answer } = shuffleChoiceOptions(q.options ?? [], q.answer ?? [], mulberry32(freshSeed()));
    return { ...q, options, answer };
  };

  const loadCurrent = (session: Session | null, index: BankIndex | null) => {
    if (!session || !index || session.index >= session.queue.length) {
      set({ current: null });
      return;
    }
    const q = index.questionById.get(session.queue[session.index]) ?? null;
    const shown = q ? presentQuestion(q) : null;
    set({
      current: shown,
      picked: [],
      fillInputs:
        shown && shown.type === 'fill'
          ? new Array(shown.blanks ?? shown.answer?.length ?? 1).fill('')
          : [],
      essayInput: '',
      essayVerdict: null,
      submitted: false,
      lastCorrect: null,
      awaitingSelfAssess: false,
    });
  };

  /** 记一次作答：题库记录、会话结果、本轮判定一起更新，三个入口（交卷 / 自评 / 改判）共用 */
  const mark = (questionId: string, correct: boolean, picked: string[], score?: number) => {
    const at = Date.now();
    const item: ResultItem = {
      questionId,
      correct,
      picked,
      at,
      ...(score === undefined ? {} : { score }),
    };
    const progress = get().progress;
    const prev = progress.records[questionId] ?? { right: 0, wrong: 0, lastAt: 0 };
    const session = get().session;
    const records = {
      ...progress.records,
      [questionId]: {
        right: prev.right + (correct ? 1 : 0),
        wrong: prev.wrong + (correct ? 0 : 1),
        lastAt: at,
      },
    };
    commit({
      records,
      lastStudyAt: at,
      ...(session ? { session: { ...session, results: [...session.results, item] } } : {}),
    });
    if (session) set({ session: { ...session, results: [...session.results, item] } });
    set({ submitted: true, lastCorrect: correct, awaitingSelfAssess: false });
    return item;
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
    essayInput: '',
    submitted: false,
    lastCorrect: null,
    awaitingSelfAssess: false,
    essayVerdict: null,
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

    importBankData: (data, opts) => {
      try {
        const parsed = validateBank(data);
        const index = indexBank(parsed);
        writeJson(BANK_KEY, parsed);
        // 换题库时按旧 id 记的错题/收藏会张冠李戴，默认一起清掉
        const keep = opts?.keepProgress ? readJson<Progress>(PROGRESS_KEY) : null;
        const progress = keep ? { ...emptyProgress(), ...keep } : emptyProgress();
        writeJson(PROGRESS_KEY, progress);
        set({
          index,
          importError: null,
          progress,
          session: progress.session,
          current: null,
          submitted: false,
          lastCorrect: null,
          awaitingSelfAssess: false,
          essayInput: '',
          essayVerdict: null,
        });
        if (progress.session) loadCurrent(progress.session, index);
      } catch (err) {
        set({ importError: err instanceof Error ? err.message : String(err) });
      }
    },

    exportBankJson: () => {
      const index = get().index;
      if (!index) return null;
      return JSON.stringify(index.data, null, 1);
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
        essayInput: '',
        essayVerdict: null,
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
      // 单选与判断题只能选一个
      if (current.type === 'single' || current.type === 'judge') {
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

    setEssay: (text) => {
      if (get().submitted) return;
      set({ essayInput: text });
    },

    submit: () => {
      const { current, picked, fillInputs, essayInput, submitted } = get();
      if (!current || submitted) return;
      if (
        (current.type === 'single' || current.type === 'multi' || current.type === 'judge') &&
        picked.length === 0
      ) {
        return;
      }
      if (current.type === 'fill' && fillInputs.every((v) => v.trim() === '')) return;

      // 简答 / 论述：有输入且题库有参考答案时按要点对照判，否则退回复习自评
      if (current.type === 'short' || current.type === 'essay') {
        const verdict = gradeEssayAnswer(current, essayInput);
        if (verdict === null) {
          set({ submitted: true, awaitingSelfAssess: true, lastCorrect: null, essayVerdict: null });
          return;
        }
        mark(current.id, verdict.correct, [essayInput.trim().slice(0, 4000)], verdict.score);
        set({ essayVerdict: verdict });
        return;
      }

      const verdict = autoGrade(current, current.type === 'fill' ? fillInputs : picked);
      if (verdict === null) {
        set({ submitted: true, awaitingSelfAssess: true, lastCorrect: null });
        return;
      }
      mark(current.id, verdict, current.type === 'fill' ? fillInputs.slice() : picked.slice());
    },

    selfAssess: (correct) => {
      const { current, awaitingSelfAssess } = get();
      if (!current || !awaitingSelfAssess) return;
      mark(current.id, correct, []);
    },

    reviseEssay: (correct) => {
      const { current, session, submitted, awaitingSelfAssess, lastCorrect } = get();
      if (!current || !submitted || awaitingSelfAssess) return;
      if (current.type !== 'short' && current.type !== 'essay') return;
      if (lastCorrect === correct) return;
      // 词面匹配只是参照分：改判时先把上一次记的分回滚，再记新的，别让同一道题记两遍
      const progress = get().progress;
      const prev = progress.records[current.id] ?? { right: 0, wrong: 0, lastAt: Date.now() };
      const records = {
        ...progress.records,
        [current.id]: {
          right: Math.max(0, prev.right - (lastCorrect ? 1 : 0) + (correct ? 1 : 0)),
          wrong: Math.max(0, prev.wrong - (lastCorrect === false ? 1 : 0) + (correct ? 0 : 1)),
          lastAt: prev.lastAt,
        },
      };
      const last = session?.results.at(-1);
      const results =
        session && last && last.questionId === current.id
          ? [...session.results.slice(0, -1), { ...last, correct }]
          : (session?.results ?? []);
      commit({ records, ...(session ? { session: { ...session, results } } : {}) });
      if (session) set({ session: { ...session, results } });
      set({ lastCorrect: correct });
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
