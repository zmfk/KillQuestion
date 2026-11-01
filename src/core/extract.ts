/**
 * 从用户给的文件里抠出文本：PDF / DOCX / TXT / MD。
 *
 * 全在浏览器里做，不上传任何服务器——所以 PDF 用 pdfjs-dist 解析，DOCX 自己解 zip。
 * 输出统一成「一行一段」的纯文本，与 scripts/parse_bank.py 当初从 PDF 提取的形态保持一致，
 * 这样下面的解析器只需要一套规则。
 */
import { unzipSync } from 'fflate';

export type SourceKind = 'pdf' | 'docx' | 'text';

export interface Extracted {
  name: string;
  kind: SourceKind;
  text: string;
  /** 页数（PDF）或段落数，用来说明「确实读进去了」 */
  units: number;
}

const PDF_PAGE_HEADER = /^第\s*\d+\s*页\s*共\s*\d+\s*页$/;

export function fileKind(name: string): SourceKind | 'json' | 'unsupported' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (/\.(txt|md|markdown|text)$/.test(lower)) return 'text';
  if (lower.endsWith('.json')) return 'json';
  return 'unsupported';
}

/** PDF：逐页取文本，顺手去掉页脚页码、按 hasEOL 还原换行 */
async function readPdf(file: File, onStep?: (done: number, total: number) => void): Promise<Extracted> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({
    data,
    isEvalSupported: false,
    // 没内嵌 ToUnicode 的中文 PDF 靠这张表才能映射回汉字（构建时从 pdfjs-dist 拷来）
    cMapUrl: './cmaps/',
    cMapPacked: true,
  }).promise;
  const lines: string[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page += 1) {
      const pdfPage = await doc.getPage(page);
      const content = await pdfPage.getTextContent();
      let line = '';
      const flush = () => {
        const s = line.replace(/\s+$/, '');
        line = '';
        if (!s.trim()) return;
        if (PDF_PAGE_HEADER.test(s.trim())) return; // 「第 3 页 共 159 页」这种页脚没有信息量
        lines.push(s);
      };
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) flush();
      }
      flush();
      onStep?.(page, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return { name: file.name, kind: 'pdf', text: lines.join('\n'), units: doc.numPages };
}

/**
 * DOCX：解 zip 拿 word/document.xml。
 * 段落 = </w:p>，段内软换行 = <w:br/>，制表符 = <w:tab/>，正文都在 <w:t> 里。
 */
async function readDocx(file: File): Promise<Extracted> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new Error('这个 .docx 解不开（可能其实是 .doc 或已损坏）。请在 Word/WPS 里「另存为 .docx」再试。');
  }
  const raw = entries['word/document.xml'];
  if (!raw) throw new Error('这不是一个正常的 Word 文档（缺少 word/document.xml）。');

  const xml = new TextDecoder('utf-8').decode(raw);
  const lines: string[] = [];
  for (const para of xml.split(/<\/w:p>/)) {
    let text = '';
    for (const m of para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g)) {
      if (m[1] !== undefined) text += decodeXml(m[1]);
      else if (m[0].startsWith('<w:br')) text += '\n';
      else text += '\t';
    }
    for (const piece of text.split('\n')) {
      const s = piece.replace(/\s+$/, '');
      if (s.trim() && !PDF_PAGE_HEADER.test(s.trim())) lines.push(s);
    }
  }
  return { name: file.name, kind: 'docx', text: lines.join('\n'), units: lines.length };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export async function extractText(
  file: File,
  onStep?: (done: number, total: number) => void,
): Promise<Extracted> {
  const kind = fileKind(file.name);
  if (kind === 'pdf') return readPdf(file, onStep);
  if (kind === 'docx') return readDocx(file);
  if (kind === 'text') {
    const text = await file.text();
    return { name: file.name, kind: 'text', text, units: text.split('\n').length };
  }
  if (kind === 'json') throw new Error('JSON 请用「导入题库 JSON」那一条，或直接拖 .pdf / .docx 让我来解析。');
  throw new Error(
    `不认识的文件类型：${file.name}。支持 .pdf、.docx、.txt、.md；旧版 .doc 请先另存为 .docx。`,
  );
}
