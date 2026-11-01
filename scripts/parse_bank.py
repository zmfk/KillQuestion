#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把党校题库 PDF 的纯文本解析成结构化题库 JSON。

输入  : input/bank_raw.txt   (由 pymupdf 导出,含 <<<PAGE n>>> 标记)
输出  : data/bank.json       结构化题目

结构:
{
  "meta": {...},
  "questions": [
     {"id":"T0001","no":1,"type":"fill","stem":"...","blanks":2,"answer":["a","b"],
      "answerText":"a；b","section":"填空题","page":8}
  ]
}
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "input" / "bank_raw.txt"
OUT = ROOT / "data" / "bank.json"

PAGE_HEADER = re.compile(r"^第\s*\d+\s*页\s*共\s*\d+\s*页$")
PAGE_MARK = re.compile(r"^<<<PAGE\s+(\d+)>>>$")
QNUM = re.compile(r"^(\d{1,3})(?![\d\s年届次月日%])(?:[.、]\s*)?(.*)$")
OPTION = re.compile(r"^([A-H])[.、]\s*(.*)$")

SECTION_TITLES = [
    ("fill", "一、填空题"),
    ("choice", "二、选择题"),
    ("short", "三、简答题"),
    ("essay", "四、论述题"),
]
END_TITLE = "长春工程学院相关知识"


def load_lines():
    raw = RAW.read_text(encoding="utf-8")
    out = []
    page = 0
    for ln in raw.split("\n"):
        ln = ln.rstrip()
        m = PAGE_MARK.match(ln.strip())
        if m:
            page = int(m.group(1))
            continue
        if PAGE_HEADER.match(ln.strip()):
            continue
        if not ln.strip():
            continue
        # PDF 排版会把答案挤到选项行尾,先拆开
        for marker in ("正确答案：", "正确答案:"):
            idx = ln.find(marker)
            if idx > 0:
                head, tail = ln[:idx], ln[idx:]
                out.append((page, head))
                out.append((page, tail))
                break
        else:
            # 选项粘连: 「A.xxxB.yyy」 → 拆成两行
            if len(ln) > 6:
                parts = re.split(r"(?<=[^\sA-Za-z0-9])(?=[A-H][.、][\u4e00-\u9fa5““《（])", ln)
                if len(parts) > 1:
                    for p in parts:
                        if p.strip():
                            out.append((page, p))
                    continue
            out.append((page, ln))
    return out


def find_sections(rows):
    """返回 [(type, start_idx, end_idx)]"""
    idx = {}
    for i, (pg, ln) in enumerate(rows):
        s = ln.strip()
        if "...." in s:
            continue  # 目录行
        for key, title in SECTION_TITLES:
            if s == title and key not in idx:
                idx[key] = i
        if s == END_TITLE:
            idx["_end"] = i
    secs = []
    starts = sorted(idx.items(), key=lambda kv: kv[1])
    for pos, (key, start) in enumerate(starts):
        if key == "_end":
            continue
        end = starts[pos + 1][1] if pos + 1 < len(starts) else len(rows)
        secs.append((key, start, end))
    return secs


def join_text(parts):
    """把 PDF 断行拼回连续文本;ASCII 与 ASCII 相邻时补空格。"""
    s = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if s and re.match(r"[A-Za-z0-9]$", s) and re.match(r"^[A-Za-z0-9]", p):
            s += " " + p
        else:
            s += p
    return s


def split_blocks(rows, start, end, ans_re):
    """按「答案行」作为题末锚点切分。

    只有当前题已经出现过答案行,下一行行首的「数字.」才算新题;
    这样题干里夹带的数字不会把题切碎。
    """
    blocks = []
    cur = None
    in_answer = False
    for pg, ln in rows[start:end]:
        s = ln.strip()
        if ans_re.match(s):
            in_answer = True
            if cur is not None:
                cur[2].append(s)
            continue
        m = QNUM.match(s)
        if m and not OPTION.match(s):
            no = int(m.group(1))
            sequential = cur is not None and cur[0] != 0 and no == cur[0] + 1
            if in_answer or cur is None or cur[0] == 0 or sequential:
                if cur is not None and cur[0] != 0:
                    blocks.append(cur)
                cur = (no, pg, [m.group(2)])
                in_answer = False
                continue
        if cur is None:
            cur = (0, pg, [])
        cur[2].append(s)
    if cur is not None:
        blocks.append(cur)
    return blocks


def parse_fill(no, page, lines):
    """填空题:题干含（ 空格 ）;答案行以 答： 开头"""
    stem_lines, ans_lines = [], []
    in_answer = False
    for ln in lines:
        if not in_answer and re.match(r"^答\s*[：:]", ln):
            in_answer = True
            ans_lines.append(re.sub(r"^答\s*[：:]\s*", "", ln))
            continue
        if in_answer:
            ans_lines.append(ln)
        else:
            stem_lines.append(ln)
    stem = join_text(stem_lines)
    answer_text = join_text(ans_lines)
    answer_text = answer_text.strip().rstrip("。；;，")
    # 空位:题干里的 （ ） / ( ) 占位
    blanks = len(re.findall(r"[（(]\s*[）)]", stem))
    parts = [x.strip() for x in re.split(r"[；;]", answer_text) if x.strip()]
    return {
        "type": "fill",
        "stem": stem,
        "blanks": blanks,
        "answer": parts if len(parts) > 1 else [answer_text],
        "answerText": answer_text,
    }


def parse_choice(no, page, lines):
    """选择题:题干 + A-H 选项 + 正确答案：X;多选答案可能多字母"""
    stem_lines, opt_lines, ans = [], [], ""
    in_opt = False
    for ln in lines:
        m = re.match(r"^正确答案\s*[：:]\s*(.+)$", ln)
        if m:
            ans = m.group(1).strip()
            continue
        if OPTION.match(ln):
            in_opt = True
        if in_opt:
            opt_lines.append(ln.strip())
        else:
            stem_lines.append(ln)
    stem = join_text(stem_lines)

    # 选项整体拼接后按 A/B/C/D 标记重新切分,修复粘连:
    #   「B.坚持社会主义道路C坚持马列主义毛泽东思想」
    joined = "".join(opt_lines)
    chunks = re.split(
        r"(?=(?:^|(?<![A-Ha-h]))[A-H](?:[.、]+\s*|(?=[\u4e00-\u9fa5])))",
        joined,
    )
    options = []
    for ch in chunks:
        ch = ch.strip()
        if not ch:
            continue
        mo = re.match(r"^([A-H])\s*[.、]*\s*(.+)$", ch) or re.match(r"^([A-H])(.+)$", ch)
        if mo:
            options.append({"key": mo.group(1), "text": mo.group(2).strip(" .、")})
    if not options:
        # 兜底:退回逐行解析
        for ln in opt_lines:
            mo = OPTION.match(ln)
            if mo:
                options.append({"key": mo.group(1), "text": mo.group(2).strip()})
            elif options:
                options[-1]["text"] += ln.strip()
    ans = re.sub(r"[^A-H]", "", ans.upper())
    return {
        "type": "multi" if len(ans) > 1 else "single",
        "stem": stem,
        "options": options,
        "answer": list(ans),
        "answerText": ans,
    }


def parse_short(no, page, lines):
    """简答题 / 论述题:题干(可能多行,可能含材料) + 答："""
    stem_lines, ans_lines = [], []
    in_answer = False
    for ln in lines:
        if not in_answer and re.match(r"^答\s*[：:]", ln):
            in_answer = True
            ans_lines.append(re.sub(r"^答\s*[：:]\s*", "", ln))
            continue
        if in_answer:
            ans_lines.append(ln)
        else:
            stem_lines.append(ln)
    # 有些题答案直接以「（一）（二）」起头,没有「答：」前缀
    if not ans_lines:
        for i, ln in enumerate(lines):
            s = ln.strip()
            if re.match(r"^[（(][一二三四五六七八九十\d]{1,3}[）)]", s):
                stem_lines, ans_lines = lines[:i], lines[i:]
                break
    stem_raw = "\n".join(x.strip() for x in stem_lines)
    return {
        "type": "short",
        "stem": join_text(stem_lines),
        "stemRaw": stem_raw,
        "answer": [join_text(ans_lines)] if ans_lines else [],
        "answerText": join_text(ans_lines),
    }


def parse_essay_section(rows, start, end):
    """论述题:【材料】+ 三小问 + 【答案】+ 分小问答案"""
    lines = [ln for _pg, ln in rows[start:end]]
    lines = lines[1:]  # 去掉「四、论述题」标题
    cut = None
    for i, l in enumerate(lines):
        if l.strip().startswith("【答案】"):
            cut = i
            break
    if cut is None:
        return []
    qpart, apart = lines[:cut], lines[cut + 1:]

    # 材料 + 问题分界
    material_lines = []
    in_mat = False
    qstart = 0
    for i, l in enumerate(qpart):
        s = l.strip()
        if s.startswith("【材料】"):
            in_mat = True
            continue
        if in_mat and re.match(r"^(请结合|请根据|根据以上材料|请回答)", s):
            in_mat = False
            qstart = i + 1
            continue
        if in_mat:
            material_lines.append(s)
    material = join_text(material_lines)

    def split_numbered(seq):
        out, cur = [], None
        for l in seq:
            s = l.strip()
            m = QNUM.match(s)
            if m:
                if cur is not None:
                    out.append(cur)
                cur = (int(m.group(1)), [m.group(2)])
                continue
            if cur is not None:
                cur[1].append(s)
        if cur is not None:
            out.append(cur)
        return [(no, join_text(parts)) for no, parts in out]

    qs = split_numbered(qpart[qstart:])
    ans_lines = []
    for l in apart:
        s = l.strip()
        s = re.sub(r"^(\d{1,3})(?:[.、]\s*)?答\s*[：:]\s*", r"\1. ", s)
        ans_lines.append(s)
    ans = split_numbered(ans_lines)
    ans_map = {no: t for no, t in ans}

    out = []
    for no, qtext in qs:
        out.append({
            "type": "essay",
            "stem": qtext,
            "material": material,
            "answer": [ans_map[no]] if no in ans_map else [],
            "answerText": ans_map.get(no, ""),
            "subNo": no,
        })
    return out


def main():
    rows = load_lines()
    secs = find_sections(rows)
    if not secs:
        print("!! 未找到分节", file=sys.stderr)
        return 1

    questions = []
    problems = []
    counters = {"fill": 0, "single": 0, "multi": 0, "short": 0, "essay": 0}
    for key, start, end in secs:
        if key == "essay":
            qs = parse_essay_section(rows, start, end)
            print(f"[essay] lines {start}-{end}  subs={len(qs)}")
            for q in qs:
                q["no"] = q["subNo"]
                q["section"] = "essay"
                q["page"] = rows[start][0]
                counters["essay"] += 1
                questions.append(q)
            continue

        ans_re = re.compile(r"^正确答案\s*[：:]") if key == "choice" else re.compile(r"^答\s*[：:]")
        blocks = split_blocks(rows, start, end, ans_re)
        print(f"[{key}] lines {start}-{end}  blocks={len(blocks)}  nos={[b[0] for b in blocks][:5]}...")
        expect = 1
        for no, page, lines in blocks:
            if no != expect:
                problems.append(f"{key}: 题号跳变 expect {expect} got {no} (page {page})")
            expect = no + 1
        for no, page, lines in blocks:
            if key == "fill":
                q = parse_fill(no, page, lines)
            elif key == "choice":
                q = parse_choice(no, page, lines)
            else:
                q = parse_short(no, page, lines)
                q["type"] = "short"
            q["no"] = no
            q["section"] = key
            q["page"] = page
            counters[q["type"]] = counters.get(q["type"], 0) + 1
            questions.append(q)

    for i, q in enumerate(questions, 1):
        q["id"] = f"Q{i:04d}"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "title": "入党积极分子 / 党员发展对象结业考试题库",
        "source": "附件3：中共长春工程学院委员会党校入党积极分子党员发展对象复习指导（第六版）.pdf",
        "total": len(questions),
        "counters": counters,
    }
    OUT.write_text(
        json.dumps({"meta": meta, "questions": questions}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print("\n== counters ==", counters)
    print("== total ==", len(questions))
    if problems:
        print("\n!! problems")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
