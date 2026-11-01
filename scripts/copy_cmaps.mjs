#!/usr/bin/env node
/*
 * 把 pdfjs 的 CMap 表复制到 public/cmaps，构建时随产物一起发出去。
 *
 * 有些中文 PDF 没内嵌 ToUnicode 表，pdf.js 只能靠 CMap（Adobe-GB1-UCS2.bcmap 之类）
 * 才能把字形映射回汉字；缺了它，这类 PDF 读出来是乱码或空白。
 * 这些文件属于 pdfjs-dist 自带数据，不进仓库（.gitignore 里有 public/cmaps/），每次构建现拷。
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist', 'cmaps');
const to = join(root, 'public', 'cmaps');

if (!existsSync(from)) {
  console.warn('[cmaps] 没找到 node_modules/pdfjs-dist/cmaps，跳过（先 npm install）');
  process.exit(0);
}

if (existsSync(to)) {
  const have = readdirSync(to).length;
  const want = readdirSync(from).length;
  if (have === want) {
    console.log(`[cmaps] 已是最新（${have} 个）`);
    process.exit(0);
  }
}

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`[cmaps] 复制 ${readdirSync(to).length} 个 CMap 表到 public/cmaps`);
