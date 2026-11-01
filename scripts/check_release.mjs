#!/usr/bin/env node
/*
 * 发布守卫：确认要推上去的东西和构建产物里都没有原始资料与题库内容。
 *
 * 规则（任何一条不过就以非 0 退出，CI 与 Pages 工作流都会拦下来）：
 *   1. 进仓库的文件里没有 PDF / Office 原件（按扩展名 + %PDF- 文件头，改名也拦得住）；
 *   2. 进仓库的 JSON 只有清单里的几个（package.json / tsconfig / manifest …），
 *      题库 JSON 没有偷偷混进来；
 *   3. dist/ 里的文件在允许名单内，没有 bank.json 之类的数据；
 *   4. dist/ 的产物里没有题库的 JSON 结构（"questions":[、"stem":" 这种数据态标记）。
 *
 * 为什么不用具体题目文字做特征：那等于把题目内容写进仓库，反而违反同一件事。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 允许进仓库的 JSON（除 package-lock 外都是配置，不含题目） */
const JSON_ALLOW = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'public/manifest.webmanifest',
]);

/** dist/ 允许出现的文件（相对 dist/） */
const DIST_ALLOW = [
  /^index\.html$/,
  /^assets\/[^/]+\.(js|mjs|css|wasm)$/,
  /^cmaps\/[^/]+\.bcmap$/,
  /^cmaps\/LICENSE$/,
  /^icon[^/]*\.(png|svg)$/,
  /^manifest\.webmanifest$/,
  /^sw\.js$/,
];

/** 原始资料与题库可能用的扩展名 */
const FORBIDDEN_EXT = /\.(pdf|docx?|pptx?|xlsx?|cbz|epub)$/i;
/** PDF 文件头（只在开头判定，避免文档里提到这几个字符就误报）；base64 形态也认 */
const PDF_HEAD = '%PDF-';
const PDF_B64 = 'JVBERi0';
/** 题库 JSON 里才会出现的数据态标记（紧凑序列化形态；README 里的示例带空格，不会撞上） */
const BANK_MARKERS = ['"stem":"', '"answerText":"', '"topicIds":["'];
/** 带空格的序列化形态（JSON.stringify(x, null, 1) 那种）：按出现次数判定，示例里出现一两次不算 */
const STEM_KEY = /"stem"\s*:/g;
const STEM_LIMIT = 20;
/** 单个文本文件体积上限，防止有人把题库直接粘进源码 */
const MAX_TEXT_BYTES = 400 * 1024;

/** 判据字符串本身就写在这个脚本里，扫内容时跳过它自己 */
const CONTENT_SKIP = new Set(['scripts/check_release.mjs']);

const problems = [];
const notes = [];

function fail(msg) {
  problems.push(msg);
}

/** 真 PDF（文件头在开头）或 base64 形态的 PDF 都算夹带 */
function looksLikePdf(text) {
  return text.startsWith(PDF_HEAD) || text.includes(PDF_B64);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** 优先问 git：已跟踪 + 未忽略的新文件，等于「git add -A 会推上去的全部」。不是 git 仓库时退回全量遍历。 */
function repoFiles() {
  try {
    const raw = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const list = raw.split('\0').filter(Boolean);
    if (list.length > 0) return [...new Set(list)].map((p) => p.split('/').join(sep));
  } catch {
    notes.push('不是 git 仓库或没有 git，退回全量遍历（跳过 node_modules / dist / .git）');
  }
  return walk(ROOT)
    .map((f) => relative(ROOT, f))
    .filter((rel) => !rel.startsWith(`dist${sep}`));
}

function checkRepoFiles(files) {
  for (const rel of files) {
    const full = join(ROOT, rel);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // 已删除但还在索引里
    }
    if (FORBIDDEN_EXT.test(rel)) {
      fail(`原始资料不该进仓库：${rel}`);
      continue;
    }
    if (/^input[/\\]/.test(rel) || /^data[/\\]/.test(rel)) {
      fail(`原始资料/中间产物目录不该进仓库：${rel}`);
      continue;
    }
    if (st.size > MAX_TEXT_BYTES) {
      fail(`文件过大，疑似题库或资料：${rel}（${Math.round(st.size / 1024)} KB）`);
      continue;
    }
    const lower = rel.toLowerCase();
    const isJson = lower.endsWith('.json') || lower.endsWith('.webmanifest');
    if (isJson && !JSON_ALLOW.has(rel.split(sep).join('/'))) {
      fail(`可疑的 JSON 进了仓库：${rel}（题库应作为本机文件导入）`);
      continue;
    }
    if (/\.(txt|md|json|ts|tsx|js|mjs|css|html|webmanifest|cmd|ps1|yml|yaml)$/i.test(rel)) {
      if (CONTENT_SKIP.has(rel.split(sep).join('/'))) continue;
      const text = readFileSync(full, 'utf8');
      if (looksLikePdf(text)) fail(`文件里夹带了 PDF 内容：${rel}`);
      // 源码里会写 answerText 这样的属性名，所以只在“数据态”上判定
      const hit = BANK_MARKERS.find((m) => text.includes(m));
      if (hit) fail(`文件里夹带了题库 JSON 数据（${hit}）：${rel}`);
      const stems = (text.match(STEM_KEY) ?? []).length;
      if (stems >= STEM_LIMIT) fail(`文件里像是整份题库（${stems} 处 stem 字段）：${rel}`);
    }
  }
}

function checkDist() {
  const dist = join(ROOT, 'dist');
  let files;
  try {
    files = walk(dist);
  } catch {
    notes.push('dist/ 不存在，跳过产物检查（先 npm run build）');
    return;
  }
  if (files.length === 0) {
    notes.push('dist/ 是空的，跳过产物检查');
    return;
  }
  const before = problems.length;
  for (const full of files) {
    const rel = relative(dist, full).split(sep).join('/');
    if (!DIST_ALLOW.some((re) => re.test(rel))) {
      fail(`构建产物里有不该发布的文件：dist/${rel}`);
      continue;
    }
    if (/\.(js|css|html|webmanifest)$/i.test(rel)) {
      const text = readFileSync(full, 'utf8');
      const hit = BANK_MARKERS.find((m) => text.includes(m));
      if (hit) fail(`构建产物里夹带了题库数据（${hit}）：dist/${rel}`);
      if (looksLikePdf(text)) fail(`构建产物里夹带了 PDF 内容：dist/${rel}`);
    }
  }
  notes.push(
    problems.length === before
      ? `dist/ 共 ${files.length} 个文件，均在允许名单内`
      : `dist/ 共 ${files.length} 个文件，有 ${problems.length - before} 个不该发布`,
  );
}

const files = repoFiles();
checkRepoFiles(files);
checkDist();

console.log(`仓库文件 ${files.length} 个；规则：无 PDF / 无题库 JSON / 产物干净`);
for (const n of notes) console.log(`  · ${n}`);

if (problems.length > 0) {
  console.error(`\n发布守卫未通过（${problems.length} 项）：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('发布守卫通过：仓库和 dist/ 里都没有原始资料与题目内容。');
