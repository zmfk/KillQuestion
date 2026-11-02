// 领域类型。题库由用户在本机导入（不进仓库、不进构建产物），用户数据只有作答记录与进度。

export type QuestionType = 'single' | 'multi' | 'judge' | 'fill' | 'short' | 'essay';

export interface Option {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  /** 原书题号（同一小节内从 1 开始） */
  no: number;
  /** fill | choice | judge | short | essay */
  section: string;
  sectionLabel: string;
  stem: string;
  options?: Option[];
  /** 选择题为选项字母；判断题为「正确 / 错误」；填空为逐空答案；简答/论述为整段答案 */
  answer?: string[];
  answerText?: string;
  /** 填空题空位数量 */
  blanks?: number;
  /** 论述题共用的材料 */
  material?: string;
  /** 简答/论述没有自动判分，由用户自评 */
  selfAssess?: boolean;
  /** 关联的重点考点 id */
  topicIds: string[];
}

export interface Topic {
  id: string;
  section: string;
  title: string;
  count: number;
}

export interface BankMeta {
  title: string;
  total: number;
  counters: Record<string, number>;
  keyTotal: number;
}

export interface BankData {
  version: number;
  meta: BankMeta;
  topics: Topic[];
  questions: Question[];
}

/**
 * 练习模式。
 * `todo` / `todoKey` 是「还没做过」的题：按作答记录筛，做过一次（不论对错）就算完成，
 * 和「错题重刷」（做错了还没订正）是两件事。
 * 带 `Key` 的变体都是「只看划重点的题」：考试分全题卷 / 重点卷，错题重刷分全部 / 重点。
 */
export type PracticeMode =
  | 'key'
  | 'all'
  | 'wrong'
  | 'wrongKey'
  | 'star'
  | 'topic'
  | 'exam'
  | 'examKey'
  | 'todo'
  | 'todoKey';

/** 一场考试的题量配比：六种题型各出几道，0 表示这一场不出该题型 */
export type ExamPlan = Record<QuestionType, number>;

export interface ModeInfo {
  mode: PracticeMode;
  topicId?: string;
}

/** 一道题的作答结果，只在这里落库 */
export interface ResultItem {
  questionId: string;
  correct: boolean;
  /** 选择题=字母；判断题=正确/错误；填空=逐空文本；简答/论述=用户输入的原文 */
  picked: string[];
  at: number;
  /** 简答/论述的对照匹配度 0..1（其它题型没有） */
  score?: number;
}

/**
 * 手动调整过的重点状态：true = 提升为重点，false = 降为普通。
 * 没记录的题沿用题库里的考点标注（`topicIds` 非空即重点）。
 */
export type KeyOverrides = Record<string, boolean>;

/** 单题历史统计（跨会话累积） */
export interface QuestionRecord {
  right: number;
  wrong: number;
  lastAt: number;
}

export interface Session {
  mode: PracticeMode;
  topicId?: string;
  label: string;
  queue: string[];
  index: number;
  results: ResultItem[];
  startedAt: number;
  /** 考试模式才有倒计时截止时间 */
  endsAt: number | null;
  /** 考试模式记下这一场的题型配比，「再来一轮」和备份恢复都照它复原 */
  plan?: ExamPlan;
}

export interface Progress {
  records: Record<string, QuestionRecord>;
  stars: string[];
  /** 手动改过重点状态的题；换题库时清空（题 id 变了） */
  keyOverrides: KeyOverrides;
  session: Session | null;
  finishedSessions: number;
  lastStudyAt: number | null;
}
