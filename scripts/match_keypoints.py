#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把题库题目匹配到「划重点」的 48 个考点。

输入  : data/bank.json, data/keypoints.json
输出  : data/bank_tagged.json（每题带 topicIds / keyScore / isKey）
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "data" / "bank.json"
KP = ROOT / "data" / "keypoints.json"
OUT = ROOT / "data" / "bank_tagged.json"

STRONG_W = 5
WEAK_W = 1
MAX_TOPICS = 3
# 必须是「强命中」才算重点：weak 词太常见，只用来排序，不能单独触发。
MIN_SCORE = STRONG_W


def norm(s):
    return re.sub(r"\s+", "", s or "")


def question_text(q):
    parts = [q.get("stem", ""), q.get("material", ""), q.get("answerText", "")]
    for o in q.get("options") or []:
        parts.append(o.get("text", ""))
    return norm("".join(parts))


def main():
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    kp = json.loads(KP.read_text(encoding="utf-8"))
    topics = kp["topics"]

    tagged = []
    hit_count = Counter()
    zero = []
    for q in bank["questions"]:
        text = question_text(q)
        scores = []
        for t in topics:
            s = 0
            strong_hits = 0
            hit_terms = []
            for kw in t.get("strong", []):
                if norm(kw) and norm(kw) in text:
                    s += STRONG_W
                    strong_hits += 1
                    hit_terms.append(kw)
            # 组合命中：组内全部出现才算一次强命中
            for grp in t.get("strongGroups", []):
                if grp and all(norm(w) and norm(w) in text for w in grp):
                    s += STRONG_W
                    strong_hits += 1
                    hit_terms.append("+".join(grp))
            for kw in t.get("weak", []):
                if norm(kw) and norm(kw) in text:
                    s += WEAK_W
                    hit_terms.append(kw)
            if s >= MIN_SCORE and strong_hits > 0:
                scores.append((s, t["id"], hit_terms))
        scores.sort(reverse=True)
        chosen = scores[:MAX_TOPICS]
        q = dict(q)
        q["topicIds"] = [c[1] for c in chosen]
        q["keyScore"] = chosen[0][0] if chosen else 0
        q["isKey"] = bool(chosen)
        q["matched"] = [{"id": c[1], "score": c[2], "terms": c[2]} for c in chosen]
        q["matched"] = [{"id": c[1], "score": c[0], "terms": c[2]} for c in chosen]
        for c in chosen:
            hit_count[c[1]] += 1
        tagged.append(q)

    OUT.write_text(
        json.dumps({"meta": bank["meta"], "questions": tagged}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print("题目总数:", len(tagged))
    print("重点题(isKey):", sum(1 for q in tagged if q["isKey"]))
    print("\n每个考点命中题数:")
    for t in topics:
        n = hit_count.get(t["id"], 0)
        flag = "  <-- 0" if n == 0 else ""
        print(f"  {t['id']} {t['section'][:2]} {t['title']}: {n}{flag}")

    zero_q = [q for q in tagged if not q["isKey"]]
    print(f"\n未匹配到考点的题: {len(zero_q)}")
    for q in zero_q[:15]:
        print(f"  {q['id']} [{q['type']}] {q['stem'][:52]}")


if __name__ == "__main__":
    main()
