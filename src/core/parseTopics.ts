/**
 * 划重点文本 → 考点清单。
 *
 * 版式就两种，都认：
 *   一、党章与党的基本理论      ← 「一、二、…」是分组
 *   党的根本宗旨               ← 其余非空行是一条考点
 * 容忍项目符号（1. / · / - / •）和 PDF 的页标记、页脚。
 */
import type { Topic } from '../types';

const GROUP = /^[一二三四五六七八九十]+[、.]\s*(.+)$/;
const BULLET = /^(?:\d{1,3}[.、)]|[·•\-—*])\s*/;
const PAGE_MARK = /^<<<PAGE\s+\d+>>>$/;
const PAGE_HEADER = /^第\s*\d+\s*页\s*共\s*\d+\s*页$/;

export interface ParsedTopics {
  topics: Topic[];
  sections: string[];
  warnings: string[];
}

export function parseTopicsText(raw: string): ParsedTopics {
  const topics: Topic[] = [];
  const sections: string[] = [];
  const warnings: string[] = [];
  let section = '';
  let n = 0;

  for (const original of raw.split(/\r?\n/)) {
    let line = original.trim();
    if (!line || PAGE_MARK.test(line) || PAGE_HEADER.test(line)) continue;
    if (line.includes('....')) continue; // 目录行

    const group = GROUP.exec(line);
    if (group) {
      section = line.replace(/\s+/g, ' ');
      if (!sections.includes(section)) sections.push(section);
      continue;
    }

    line = line.replace(BULLET, '').trim();
    if (!line) continue;
    if (line.length < 2 || line.length > 60) continue; // 太长多半是正文，不是考点标题
    if (/^[0-9\s.、%]+$/.test(line)) continue;

    n += 1;
    topics.push({
      id: `k${String(n).padStart(2, '0')}`,
      section: section || '未分组',
      title: line,
      count: 0,
    });
  }

  if (topics.length === 0) {
    warnings.push('这份文件里没读到任何考点标题，可能不是划重点页。');
  } else if (sections.length === 0) {
    warnings.push('没读到「一、二、…」这种分组标题，全部考点都归到了「未分组」。');
  }
  return { topics, sections, warnings };
}
