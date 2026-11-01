/**
 * 题库文本 → 结构化题目。
 *
 * 规则与 scripts/parse_bank.py 一一对应（那份脚本当初跑通过 159 页的原书），
 * 区别只是跑在浏览器里、且不再依赖某个单位特有的收尾标题：
 *
 *   一、填空题   题干里留「（ ）」表示空位，答案行以「答：」开头
 *   二、选择题   选项 A. B. C. D.，答案行以「正确答案：」开头，多字母即多选
 *   三、判断题   题干后接答案行，值认 √ / × / 对 / 错 / 正确 / 错误（附件 3 没有这一节，别的题库很常见）
 *   四、简答题   「答：」后面整段就是答案
 *   五、论述题   【材料】+ 若干小问 +【答案】+ 分问答案
 *
 * 排版造成的脏活（PDF 把答案挤到选项行尾、选项粘连、页眉页脚）都在这里吸收掉。
 */
import { normalizeJudge } from './grade';
import type { Question, QuestionType } from '../types';

export const SECTION_LABEL: Record<string, string> = {
  fill: '填空题',
  choice: '选择题',
  judge: '判断题',
  short: '简答题',
  essay: '论述题',
};

const PAGE_MARK = /^<<<PAGE\s+(\d+)>>>$/;
const PAGE_HEADER = /^第\s*\d+\s*页\s*共\s*\d+\s*页$/;
/** 题号：顺手认全角句点（Word/PDF 里 1．2． 很常见） */
const QNUM = /^(\d{1,3})(?![\d\s年届次月日%])(?:[.、．]\s*)?(.*)$/;
const OPTION = /^([A-H])[.、．]\s*(.*)$/;
const BIG_TITLE = /^[一二三四五六七八九十]+、/;

/** 小节标题：「一、填空题」这种；序号可以是任意汉字序号，题型名按别名认 */
const SECTION_HEADING = /^[一二三四五六七八九十]+[、.．]\s*(.+)$/;
/** 题型别名 → 内部 key。判断题不在这几年的原书里，但别处题库很常见，一起认。 */
const SECTION_ALIAS: Array<[string, string]> = [
  ['填空题', 'fill'],
  ['选择题', 'choice'],
  ['单项选择题', 'choice'],
  ['多项选择题', 'choice'],
  ['判断题', 'judge'],
  ['简答题', 'short'],
  ['论述题', 'essay'],
];

/** 「一、判断题」→ 'judge'；不是已知题型小节就返回 null */
function sectionKeyOf(text: string): string | null {
  const m = SECTION_HEADING.exec(text.trim());
  if (!m) return null;
  const name = m[1].trim();
  const hit = SECTION_ALIAS.find(([alias]) => alias === name);
  return hit ? hit[1] : null;
}

type Row = { page: number; text: string };

export interface ParsedQuestion {
  type: QuestionType;
  no: number;
  section: string;
  sectionLabel: string;
  page: number;
  stem: string;
  options?: Array<{ key: string; text: string }>;
  answer: string[];
  answerText: string;
  blanks?: number;
  material?: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  counters: Record<QuestionType, number>;
  /** 识别到的小节（空数组说明这份文件不像题库） */
  sections: string[];
  warnings: string[];
}

function loadRows(raw: string): Row[] {
  const rows: Row[] = [];
  let page = 0;
  for (const original of raw.split(/\r?\n/)) {
    const trimmed = original.trim();
    const mark = PAGE_MARK.exec(trimmed);
    if (mark) {
      page = Number(mark[1]);
      continue;
    }
    if (!trimmed) continue;
    if (PAGE_HEADER.test(trimmed)) continue;

    // 答案被挤到选项行尾时先拆开，后面按行首锚点切块才不会漏答案
    const cut = Math.max(trimmed.indexOf('正确答案：'), trimmed.indexOf('正确答案:'));
    if (cut > 0) {
      rows.push({ page, text: trimmed.slice(0, cut) });
      rows.push({ page, text: trimmed.slice(cut) });
      continue;
    }
    // 选项粘连：「B.坚持…C.坚持…」→ 两行
    if (trimmed.length > 6) {
      const parts = trimmed.split(/(?<=[^\sA-Za-z0-9])(?=[A-H][.、．][\u4e00-\u9fa5“《（])/);
      if (parts.length > 1) {
        for (const p of parts) if (p.trim()) rows.push({ page, text: p });
        continue;
      }
    }
    rows.push({ page, text: trimmed });
  }
  return rows;
}

function findSections(rows: Row[]): Array<{ key: string; start: number }> {
  const hit: Array<{ key: string; start: number }> = [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const s = row.text;
    if (s.includes('....')) return; // 目录行
    const key = sectionKeyOf(s);
    if (key && !seen.has(key)) {
      seen.add(key);
      hit.push({ key, start: i });
    }
  });
  return hit.sort((a, b) => a.start - b.start);
}

/** 最后一个已知题型小节之后，第一个「五、xxx」之类的大标题视为正文结束 */
function findEnd(rows: Row[], from: number): number {
  for (let i = from + 1; i < rows.length; i += 1) {
    if (BIG_TITLE.test(rows[i].text) && sectionKeyOf(rows[i].text) === null) {
      return i;
    }
  }
  return rows.length;
}

/** 断行拼回连续文本；ASCII 与 ASCII 相邻时补空格，免得 2026年全国 粘成乱串 */
function joinText(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (out && /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += ' ';
    out += p;
  }
  return out;
}

/** 以答案行作题末锚点切块：只有当前题已出现过答案行，下一个「数字.」才算新题 */
function splitBlocks(rows: Row[], start: number, end: number, ansRe: RegExp) {
  const blocks: Array<{ no: number; page: number; lines: string[] }> = [];
  let cur: { no: number; page: number; lines: string[] } | null = null;
  let inAnswer = false;
  for (const row of rows.slice(start, end)) {
    const s = row.text;
    if (ansRe.test(s)) {
      inAnswer = true;
      cur?.lines.push(s);
      continue;
    }
    const m = QNUM.exec(s);
    if (m && !OPTION.test(s)) {
      const no = Number(m[1]);
      const sequential = cur !== null && cur.no !== 0 && no === cur.no + 1;
      if (inAnswer || cur === null || cur.no === 0 || sequential) {
        if (cur && cur.no !== 0) blocks.push(cur);
        cur = { no, page: row.page, lines: [m[2]] };
        inAnswer = false;
        continue;
      }
    }
    if (!cur) cur = { no: 0, page: row.page, lines: [] };
    cur.lines.push(s);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

function parseFill(no: number, page: number, lines: string[]): ParsedQuestion {
  const stemLines: string[] = [];
  const ansLines: string[] = [];
  let inAnswer = false;
  for (const line of lines) {
    if (!inAnswer && /^答\s*[：:]/.test(line)) {
      inAnswer = true;
      ansLines.push(line.replace(/^答\s*[：:]\s*/, ''));
      continue;
    }
    (inAnswer ? ansLines : stemLines).push(line);
  }
  const stem = joinText(stemLines);
  const answerText = joinText(ansLines).replace(/[。；;，]+$/, '');
  const blanks = (stem.match(/[（(]\s*[）)]/g) ?? []).length;
  let parts = answerText
    .split(/[；;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  let finalAnswerText = answerText;
  // 少数多空题答案用顿号/逗号串写（如「甲、乙」），只有拆分后恰好等于空数才拆，
  // 避免误伤含顿号的单空答案。
  if (parts.length === 1 && blanks > 1) {
    const extra = answerText
      .split(/[、，,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (extra.length === blanks) {
      parts = extra;
      finalAnswerText = parts.join('；');
    }
  }
  return {
    type: 'fill',
    no,
    page,
    section: 'fill',
    sectionLabel: SECTION_LABEL.fill,
    stem,
    blanks,
    answer: parts.length > 1 ? parts : [answerText],
    answerText: finalAnswerText,
  };
}

function parseChoice(no: number, page: number, lines: string[]): ParsedQuestion {
  const stemLines: string[] = [];
  const optLines: string[] = [];
  let ans = '';
  let inOption = false;
  for (const line of lines) {
    const m = /^正确答案\s*[：:]\s*(.+)$/.exec(line);
    if (m) {
      ans = m[1].trim();
      continue;
    }
    if (OPTION.test(line)) inOption = true;
    (inOption ? optLines : stemLines).push(line.trim());
  }
  const stem = joinText(stemLines);

  // 选项整体拼接后按 A/B/C… 重新切，修复粘连
  const joined = optLines.join('');
  const chunks = joined.split(/(?=(?:^|(?<![A-Ha-h]))[A-H](?:[.、．]+\s*|(?=[\u4e00-\u9fa5])))/);
  const options: Array<{ key: string; text: string }> = [];
  for (const chunk of chunks) {
    const ch = chunk.trim();
    if (!ch) continue;
    const mo = /^([A-H])\s*[.、．]*\s*(.+)$/.exec(ch) ?? /^([A-H])(.+)$/.exec(ch);
    if (mo) options.push({ key: mo[1], text: mo[2].trim().replace(/^[ .、．]+/, '') });
  }
  if (options.length === 0) {
    for (const line of optLines) {
      const mo = OPTION.exec(line);
      if (mo) options.push({ key: mo[1], text: mo[2].trim() });
      else if (options.length > 0) options[options.length - 1].text += line.trim();
    }
  }
  const letters = ans.toUpperCase().replace(/[^A-H]/g, '');
  return {
    type: letters.length > 1 ? 'multi' : 'single',
    no,
    page,
    section: 'choice',
    sectionLabel: SECTION_LABEL.choice,
    stem,
    options,
    answer: letters.split(''),
    answerText: letters,
  };
}

function parseShort(no: number, page: number, lines: string[]): ParsedQuestion {
  let stemLines: string[] = [];
  let ansLines: string[] = [];
  let inAnswer = false;
  for (const line of lines) {
    if (!inAnswer && /^答\s*[：:]/.test(line)) {
      inAnswer = true;
      ansLines.push(line.replace(/^答\s*[：:]\s*/, ''));
      continue;
    }
    (inAnswer ? ansLines : stemLines).push(line);
  }
  // 有些题答案直接以「（一）（二）」起头，没有「答：」前缀
  if (ansLines.length === 0) {
    const i = lines.findIndex((l) => /^[（(][一二三四五六七八九十\d]{1,3}[）)]/.test(l.trim()));
    if (i > 0) {
      stemLines = lines.slice(0, i);
      ansLines = lines.slice(i);
    }
  }
  return {
    type: 'short',
    no,
    page,
    section: 'short',
    sectionLabel: SECTION_LABEL.short,
    stem: joinText(stemLines),
    answer: ansLines.length > 0 ? [joinText(ansLines)] : [],
    answerText: joinText(ansLines),
  };
}

/** 判断题整节：题干 + 答案行（认「答：」「答案：」「正确答案：」，值认 √/对/T、×/错/F） */
function parseJudge(no: number, page: number, lines: string[]): ParsedQuestion {
  const stemLines: string[] = [];
  let rawAnswer = '';
  let inAnswer = false;
  for (const line of lines) {
    const m = /^(?:答|答案|正确答案)\s*[：:]\s*(.*)$/.exec(line.trim());
    if (!inAnswer && m) {
      inAnswer = true;
      rawAnswer = m[1].trim();
      continue;
    }
    if (!inAnswer) stemLines.push(line);
  }
  const stem = joinText(stemLines);
  // 有些版式把 √ / × 直接写在题干末尾的括号里
  let answer = normalizeJudge(rawAnswer);
  if (answer === null) {
    const tail = /([√×✓✗对错])\s*[）)]\s*$/.exec(stem);
    if (tail) answer = normalizeJudge(tail[1]);
  }
  return {
    type: 'judge',
    no,
    page,
    section: 'judge',
    sectionLabel: SECTION_LABEL.judge,
    stem,
    answer: answer !== null ? [answer] : [],
    answerText: answer ?? rawAnswer,
  };
}

/** 论述题整节：材料 + 小问 + 【答案】+ 分问答案 */
function parseEssaySection(rows: Row[], start: number, end: number): ParsedQuestion[] {
  const lines = rows.slice(start + 1, end).map((r) => r.text);
  const cut = lines.findIndex((l) => l.trim().startsWith('【答案】'));
  if (cut < 0) return [];
  const qPart = lines.slice(0, cut);
  const aPart = lines.slice(cut + 1);

  const materialLines: string[] = [];
  let inMaterial = false;
  let qStart = 0;
  qPart.forEach((line, i) => {
    const s = line.trim();
    if (s.startsWith('【材料】')) {
      inMaterial = true;
      const inline = s.replace(/^【材料】\s*/, '');
      if (inline) materialLines.push(inline); // 材料跟标题写在同一行的版式
      return;
    }
    if (inMaterial && /^(请结合|请根据|根据以上材料|请回答)/.test(s)) {
      inMaterial = false;
      qStart = i + 1;
      return;
    }
    if (inMaterial) materialLines.push(s);
  });
  const material = joinText(materialLines);

  const numbered = (seq: string[]) => {
    const out: Array<{ no: number; text: string }> = [];
    let cur: { no: number; parts: string[] } | null = null;
    for (const line of seq) {
      const s = line.trim();
      const m = QNUM.exec(s);
      if (m) {
        if (cur) out.push({ no: cur.no, text: joinText(cur.parts) });
        cur = { no: Number(m[1]), parts: [m[2]] };
        continue;
      }
      cur?.parts.push(s);
    }
    if (cur) out.push({ no: cur.no, text: joinText(cur.parts) });
    return out;
  };

  const qs = numbered(qPart.slice(qStart));
  const ansMap = new Map<number, string>();
  for (const item of numbered(aPart.map((l) => l.replace(/^(\d{1,3})(?:[.、]\s*)?答\s*[：:]\s*/, '$1. ')))) {
    ansMap.set(item.no, item.text);
  }

  return qs.map((q) => ({
    type: 'essay' as QuestionType,
    no: q.no,
    page: rows[start].page,
    section: 'essay',
    sectionLabel: SECTION_LABEL.essay,
    stem: q.text,
    material,
    answer: ansMap.has(q.no) ? [ansMap.get(q.no) as string] : [],
    answerText: ansMap.get(q.no) ?? '',
  }));
}

export function parseBankText(raw: string): ParseResult {
  const rows = loadRows(raw);
  const sections = findSections(rows);
  const warnings: string[] = [];
  const questions: ParsedQuestion[] = [];
  const counters: Record<QuestionType, number> = {
    fill: 0,
    single: 0,
    multi: 0,
    judge: 0,
    short: 0,
    essay: 0,
  };

  if (sections.length === 0) {
    return {
      questions,
      counters,
      sections: [],
      warnings: [
        '没找到「一、填空题 / 二、选择题 / 三、判断题 / 四、简答题 / 五、论述题」这类小节标题，这份文件可能不是题库。',
      ],
    };
  }

  sections.forEach((sec, i) => {
    const end = i + 1 < sections.length ? sections[i + 1].start : findEnd(rows, sec.start);

    if (sec.key === 'essay') {
      for (const q of parseEssaySection(rows, sec.start, end)) {
        questions.push(q);
        counters.essay += 1;
      }
      return;
    }

    const ansRe =
      sec.key === 'choice'
        ? /^正确答案\s*[：:]/
        : sec.key === 'judge'
          ? /^(?:答|答案|正确答案)\s*[：:]/
          : /^答\s*[：:]/;
    const blocks = splitBlocks(rows, sec.start, end, ansRe);
    let expect = 1;
    for (const block of blocks) {
      if (block.no !== expect) {
        warnings.push(`${SECTION_LABEL[sec.key]} 题号从 ${expect} 跳到 ${block.no}（第 ${block.page} 页），原书就是断续的可以忽略。`);
      }
      expect = block.no + 1;
      const q =
        sec.key === 'fill'
          ? parseFill(block.no, block.page, block.lines)
          : sec.key === 'choice'
            ? parseChoice(block.no, block.page, block.lines)
            : sec.key === 'judge'
              ? parseJudge(block.no, block.page, block.lines)
              : parseShort(block.no, block.page, block.lines);
      if (!q.stem.trim()) {
        warnings.push(`${SECTION_LABEL[sec.key]} 第 ${block.no} 题没读到题干（第 ${block.page} 页），已跳过。`);
        continue;
      }
      questions.push(q);
      counters[q.type] += 1;
    }
  });

  return { questions, counters, sections: sections.map((s) => SECTION_LABEL[s.key]), warnings };
}

/** 给题目补上 id / topicIds，长成应用认的样子 */
export function toBankQuestions(parsed: ParsedQuestion[]): Question[] {
  return parsed.map((q, i) => {
    const item: Question = {
      id: `Q${String(i + 1).padStart(4, '0')}`,
      type: q.type,
      no: q.no,
      section: q.section,
      sectionLabel: q.sectionLabel,
      stem: q.stem,
      answer: q.answer,
      answerText: q.answerText,
      topicIds: [],
    };
    if (q.options && q.options.length > 0) item.options = q.options;
    if (q.blanks !== undefined) item.blanks = q.blanks;
    if (q.material) item.material = q.material;
    if (q.type === 'short' || q.type === 'essay') item.selfAssess = true;
    return item;
  });
}
