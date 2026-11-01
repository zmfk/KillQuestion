// 领域类型。题库由用户在本机导入（不进仓库、不进构建产物），用户数据只有作答记录与进度。

export type QuestionType = 'single' | 'multi' | 'fill' | 'short' | 'essay';

export interface Option {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  /** 原书题号（同一小节内从 1 开始） */
  no: number;
  /** fill | choice | short | essay */
  section: string;
  sectionLabel: string;
  stem: string;
  options?: Option[];
  /** 选择题为选项字母；填空为逐空答案；简答/论述为整段答案 */
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

export type PracticeMode = 'key' | 'all' | 'wrong' | 'star' | 'topic' | 'exam';

export interface ModeInfo {
  mode: PracticeMode;
  topicId?: string;
}

/** 一道题的作答结果，只在这里落库 */
export interface ResultItem {
  questionId: string;
  correct: boolean;
  /** 选择题=字母；填空=逐空文本；简答/论述=自评 */
  picked: string[];
  at: number;
}

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
}

export interface Progress {
  records: Record<string, QuestionRecord>;
  stars: string[];
  session: Session | null;
  finishedSessions: number;
  lastStudyAt: number | null;
}
