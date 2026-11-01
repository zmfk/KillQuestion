#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把带考点标注的题库压成可导入的题库文件。

输出到仓库根目录 `KillQuestion-题库.json`（被 .gitignore 排除）：
仓库里不保存任何题目内容，题库以本地文件的形式在应用里导入。
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAGGED = ROOT / "data" / "bank_tagged.json"
KP = ROOT / "data" / "keypoints.json"
OUT = ROOT / "KillQuestion-题库.json"

SECTION_LABEL = {
    "fill": "填空题",
    "choice": "选择题",
    "short": "简答题",
    "essay": "论述题",
}


def main():
    tagged = json.loads(TAGGED.read_text(encoding="utf-8"))
    kp = json.loads(KP.read_text(encoding="utf-8"))
    questions = []
    topic_count = Counter()
    for q in tagged["questions"]:
        item = {
            "id": q["id"],
            "type": q["type"],
            "no": q["no"],
            "section": q["section"],
            "sectionLabel": SECTION_LABEL.get(q["section"], q["section"]),
            "stem": q["stem"],
            "topicIds": q.get("topicIds", []),
        }
        if q.get("options"):
            item["options"] = [{"key": o["key"], "text": o["text"]} for o in q["options"]]
        if q.get("answer"):
            item["answer"] = q["answer"]
        if q.get("answerText"):
            item["answerText"] = q["answerText"]
        if q.get("blanks"):
            item["blanks"] = q["blanks"]
        if q.get("material"):
            item["material"] = q["material"]
        if q["type"] == "essay":
            item["selfAssess"] = True
        if q["type"] == "short":
            item["selfAssess"] = True
        for tid in item["topicIds"]:
            topic_count[tid] += 1
        questions.append(item)

    topics = [
        {
            "id": t["id"],
            "section": t["section"],
            "title": t["title"],
            "count": topic_count.get(t["id"], 0),
        }
        for t in kp["topics"]
    ]

    counters = Counter(q["type"] for q in questions)
    payload = {
        "version": 1,
        "meta": {
            "title": "入党积极分子 / 党员发展对象结业考试题库",
            "total": len(questions),
            "counters": dict(counters),
            "keyTotal": sum(1 for q in questions if q["topicIds"]),
        },
        "topics": topics,
        "questions": questions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, f"{OUT.stat().st_size/1024:.1f} KB")
    print("counters:", dict(counters))
    print("key questions:", payload["meta"]["keyTotal"])
    print("topics:", len(topics))


if __name__ == "__main__":
    main()
