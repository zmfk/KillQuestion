#!/usr/bin/env node
/*
 * 用 CDP 驱动 headless Edge 截图（本机没有装 playwright，用内置 WebSocket 就够）。
 *
 * 用法：
 *   node scripts/shot.mjs <url> <out.png> [--before=<js>] [--w=1100] [--h=1400] [--wait=800]
 *
 * --before 里的 JS 会在页面加载后、截图前执行一次，用来植入 localStorage 之类的初始状态。
 */
const [, , url, out, ...rest] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--before=js] [--w=] [--h=] [--wait=]');
  process.exit(1);
}
const opts = Object.fromEntries(
  rest
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const i = a.indexOf('=');
      return i === -1 ? [a.slice(2), ''] : [a.slice(2, i), a.slice(i + 1)];
    }),
);

const W = Number(opts.w ?? 1100);
const H = Number(opts.h ?? 1400);
const WAIT = Number(opts.wait ?? 800);
const PORT = Number(opts.port ?? 9333);

const { spawn } = await import('node:child_process');
const { writeFileSync } = await import('node:fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = `${process.env.TEMP}/kq-shot-${Date.now()}`;

const proc = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 端口还没起来 */
    }
    await sleep(250);
  }
  throw new Error('CDP 端口没起来');
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

try {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const call = rpc(ws);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: W < 600,
  });
  await call('Page.navigate', { url });
  await sleep(1200);

  if (opts.before) {
    const res = await call('Runtime.evaluate', { expression: opts.before, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    // 同一个 URL 再 navigate 可能被当成 hash 变化，必须显式 reload 才能重新 boot store
    await call('Page.reload', { ignoreCache: false });
    await sleep(1400);
  }

  await sleep(WAIT);
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved', out);

  ws.close();
} catch (err) {
  console.error('shot failed:', err.message);
  process.exitCode = 1;
} finally {
  proc.kill();
  await sleep(150);
}
