#!/usr/bin/env node
/*
 * web-client demo — 本地运行服务器（纯 JavaScript / Node 零依赖；仅本地联调用）
 * ======================================================================
 * 同时扮演生产环境下【宿主后端】的三个角色（demo 里唯一的"非前端"环节，
 * 生产拷贝时本文件不带走 —— 这三件事由你宿主应用自己的后端承担）：
 *
 *   1. 静态服务器：把本目录（含 docs/）发给浏览器        GET /
 *   2. 保存回调接收端：                                   POST /callback?file=xxx
 *        DS 对【没有回调地址】的文档会直接拒绝保存（架构如此），
 *        所以本地联调必须有它。status 2/6 时下载结果写回 docs/<file>，
 *        并把上一状态归档为一个版本（版本历史的数据来源）。
 *   3. eCTD 目录树接口：                                  GET /api/ectd/files/tree
 *        数据在 ectd-tree.json（改完保存，链接对话框下次打开即生效）。
 *   4. 版本历史接口（宿主职责，编辑器侧已接线）：
 *        GET  /api/history/list?file=xxx    版本列表（history + historyData）
 *        GET  /api/history/file?file=xxx&ver=N
 *                                           某版本的文件快照（DS 服务器来下载）
 *        PUT  /api/history/restore          恢复某版本（会生成新版本）
 *   5. eCTD 外链解析接口（mock 宿主职责）：
 *        GET  /api/ectd/link/href?leafId=xxx
 *                                           叶子 ID -> 发布相对路径 + 叶子 ID
 *        GET  /api/ectd/link/href?target=xxx
 *                                           选择器路径 -> 发布相对路径 + 叶子 ID
 *
 * 存储：docs/<file> 是当前版本；docs/<file>-history/meta.json 是版本元数据，
 *       docs/<file>-history/<N>/prev.<ext> 是版本 N 的快照（与 example 布局一致）。
 *
 * 用法:  node serve.js [port]      # 默认 8081
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DOCS = path.join(ROOT, 'docs');
const PORT = Number(process.argv[2]) || 8081;

// 宿主后端的公开地址：DocumentServer 在容器里经 docker 网关访问宿主机。
// 生产环境换成宿主后端自己的地址（历史版本的 url 会被 DS 服务器下载）。
const PUBLIC_BASE = process.env.DEMO_PUBLIC_BASE || `http://172.17.0.1:${PORT}`;

// 外链悬浮提示解析接口的演示数据：叶子 ID -> 发布相对路径（含中文/空格/&/#）。
const MOCK_LINKS = {
  'l-537aba45-1971-437a-8b72-d1a514d36aec': '../../1.2 封面信/封面信 & 截图 #1.pdf',
  'l-11111111-2222-3333-4444-555555555555': '../../0002/模块一/附件.docx'
};

// 未归一化的选择器路径 -> 发布路径 + 目标叶子 ID（点击时用 leafId 打开宿主阅读器）。
const MOCK_TARGETS = {
  './@0001/1.2 封面信/3.pdf': {
    href: '../../0001/1.2 封面信/3.pdf',
    leafId: 'l-cb9e7e9f-1111-2222-3333-444455556666'
  }
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

function cors(req, res) {
  // 编辑器 iframe 跑在 DS 域下，跨域访问宿主接口必须带 CORS 头；
  // 演示环境回显 Origin，生产建议收紧为宿主自己的域名白名单。
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

// ---------- 2. eCTD 目录树接口（ectd-tree.json 是裸数组，按契约包外层） ----------
function serveTree(req, res) {
  fs.readFile(path.join(ROOT, 'ectd-tree.json'), 'utf-8', (err, txt) => {
    let body, code = 0;
    if (err) { code = 1; body = JSON.stringify({ code: 1, message: 'tree file error' }); console.log('[tree] error:', err.message); }
    else {
      try { body = JSON.stringify({ code: 0, data: JSON.parse(txt) }); }
      catch (e) { code = 1; body = JSON.stringify({ code: 1, message: 'bad json: ' + e.message }); console.log('[tree] error:', e.message); }
    }
    cors(req, res);
    res.writeHead(code === 0 ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    if (code === 0) console.log('[tree] served ectd-tree.json');
  });
}

// ---------- 2.1 eCTD 外链解析接口（mock 宿主后端） ----------
//   编辑器悬停 / 点击 /GoToR、/Launch 外链时 GET：
//     {resolveUrl}&leafId=<叶子ID>  =>  { "code": 0, "data": { "href": "相对路径", "leafId": "l-..." } }
//     {resolveUrl}&target=<原值>    =>  同上（原值如 ./@0001/...，由宿主解析成叶子）
//   href 是相对当前文档目录的 POSIX 相对路径（可含中文/空格/&/#），
//   编辑器只展示、不当 URL 用；leafId 用于点击时打开宿主阅读器。
//   演示数据见下方 MOCK_LINKS / MOCK_TARGETS。
//   联调降级时可给 resolveUrl 加参数（mock 专用）：
//     fail=401|500|400   直接返回对应错误
//     delay=<ms>         延迟响应（配合编辑器 3s 超时验证）
function serveLinkHref(req, res, u) {
  const leafId = u.searchParams.get('leafId') || '';
  const target = u.searchParams.get('target') || '';
  const fail = Number(u.searchParams.get('fail')) || 0;
  const delay = Math.min(Number(u.searchParams.get('delay')) || 0, 15000);

  setTimeout(function() {
    cors(req, res);
    const label = leafId ? 'leafId=' + leafId : 'target=' + target;
    if (fail) {
      res.writeHead(fail, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 1, message: 'mock failure ' + fail }));
      console.log('[link-href] ' + label + ' -> mock ' + fail);
      return;
    }
    let data = null;
    if (target) {
      data = MOCK_TARGETS[target] || null;
    } else {
      const href = MOCK_LINKS[leafId];
      if (href) data = { href: href, leafId: leafId };
    }
    res.writeHead(data ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data ? { code: 0, data: data } : { code: 1, message: 'unknown link target' }));
    console.log('[link-href] ' + label + ' -> ' + (data ? data.href : 'unknown'));
  }, delay);
}

// ---------- 版本历史存储（与 ONLYOFFICE example 的布局一致） ----------
//   docs/<file>                     当前版本
//   docs/<file>-history/meta.json   版本元数据 [{version, key, created, user}]
//   docs/<file>-history/<N>/prev.<ext>  版本 N 的快照（离开版本 N 时归档）
function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function historyDir(fname) {
  return path.join(DOCS, fname + '-history');
}

function readMeta(fname) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(historyDir(fname), 'meta.json'), 'utf8'));
    return Array.isArray(m.versions) ? m.versions : [];
  } catch (e) { return []; }
}

function writeMeta(fname, versions) {
  fs.mkdirSync(historyDir(fname), { recursive: true });
  fs.writeFileSync(path.join(historyDir(fname), 'meta.json'),
                   JSON.stringify({ versions }, null, 2));
}

// 版本的 key：编辑器会把它拼进 websocket 路径 /doc/<key>/c。
// 文件名/会话 key 里的空格、中文不转义会让 DS 回 404/400（版本查看一直停在"正在打开文件"）。
function sanitizeKey(s) {
  return String(s).replace(/[^A-Za-z0-9._-]/g, '_');
}

function hostKey(fname, n) {
  return 'host-' + sanitizeKey(fname) + '-v' + n;
}

// ★ key 还必须【每个版本唯一】。DS 按 key 缓存已下载的文档：两个版本共用一个 key 时，
// 第二次打开历史版本不会再向宿主下载，而是直接复用第一次缓存的内容（编辑会话的
// 原始文件）——表现就是"最上面的版本和当前文件内容不一致"。
// 保存回调里的 key 是编辑会话 key，同一会话的多次保存会重复，所以按版本号加后缀。
function versionKey(fname, n, rawKey) {
  return rawKey ? sanitizeKey(rawKey) + '-v' + n : hostKey(fname, n);
}

// 旧 meta 里的 key 可能没有版本后缀（甚至同一会话多个版本重复）——读取时归一化，
// 保证每个版本拿到独立 key；下次保存写回 meta 时即完成迁移。
function normalizeKey(fname, v) {
  const raw = String(v.key || '');
  if (!raw) return hostKey(fname, v.version);
  const suffix = '-v' + v.version;
  return raw.endsWith(suffix) ? raw : sanitizeKey(raw) + suffix;
}

// 当前磁盘状态对应的版本列表（从未保存过的文件按 version 1 处理）
function listVersions(fname) {
  const target = path.join(DOCS, fname);
  let versions = readMeta(fname);
  if (!versions.length && fs.existsSync(target)) {
    versions = [{
      version: 1, key: hostKey(fname, 1),
      created: fmtDate(fs.statSync(target).mtime),
      user: { id: 'host', name: '初始版本' }
    }];
  }
  return versions.map(v => Object.assign({}, v, { key: normalizeKey(fname, v) }));
}

// 收到新内容：归档旧状态为一个版本，再写入主文件。返回新版本号（内容未变返回 0）
function recordVersion(fname, data, body) {
  const target = path.join(DOCS, fname);
  const ext = path.extname(fname);
  const now = new Date();
  const key = (body && body.key) || '';
  const users = body && Array.isArray(body.users) ? body.users : [];
  const user = { id: users[0] || 'demo-user-1', name: 'Demo User' };

  if (!fs.existsSync(target)) {           // 首次写入 = 版本 1
    writeMeta(fname, [{ version: 1, key: versionKey(fname, 1, key),
                        created: fmtDate(now), user }]);
    fs.writeFileSync(target, data);
    return 1;
  }

  const old = fs.readFileSync(target);
  if (old.equals(data)) return 0;         // 内容没变，不产生新版本

  const versions = listVersions(fname);
  const cur = versions[versions.length - 1].version;
  const snapDir = path.join(historyDir(fname), String(cur));
  fs.mkdirSync(snapDir, { recursive: true });
  fs.copyFileSync(target, path.join(snapDir, 'prev' + ext));   // 归档离开的版本
  if (!fs.existsSync(target + '.bak')) fs.copyFileSync(target, target + '.bak');

  versions.push({ version: cur + 1, key: versionKey(fname, cur + 1, key),
                  created: fmtDate(now), user });
  fs.writeFileSync(target, data);
  writeMeta(fname, versions);
  return cur + 1;
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// GET /api/history/list?file=xxx  ->  {countVersion, history, historyData}
// 形状与 ONLYOFFICE example 的 /historyObj 完全一致（宿主契约）。
function serveHistoryList(req, res, u) {
  const fname = path.basename(u.searchParams.get('file') || '');
  const target = path.join(DOCS, fname);
  if (!fname || !fs.existsSync(target)) return json(res, 404, { error: 'file not found' });

  const ext = path.extname(fname).slice(1).toLowerCase();
  const versions = listVersions(fname);
  const count = versions.length;

  const history = versions.map(v => ({
    version: v.version, key: v.key || '', created: v.created, user: v.user
  }));
  const historyData = versions.map(v => ({
    fileType: ext,
    version: v.version,
    key: v.key || '',
    // 统一走宿主接口：DS 服务器下载后交给历史查看器渲染
    url: `${PUBLIC_BASE}/api/history/file?file=${encodeURIComponent(fname)}&ver=${v.version}`,
    directUrl: null
  }));

  json(res, 200, { countVersion: count, history, historyData });
  console.log(`[history] list ${fname}: ${count} version(s)`);
}

// GET /api/history/file?file=xxx&ver=N  ->  该版本的文件快照
function serveHistoryFile(req, res, u) {
  const fname = path.basename(u.searchParams.get('file') || '');
  const ver = Number(u.searchParams.get('ver'));
  const target = path.join(DOCS, fname);
  if (!fname || !Number.isInteger(ver) || ver < 1 || !fs.existsSync(target))
    return json(res, 400, { error: 'bad request' });

  const count = listVersions(fname).length;
  const file = ver >= count
    ? target                                                        // 当前版本 = 主文件
    : path.join(historyDir(fname), String(ver), 'prev' + path.extname(fname));
  console.log(`[history] file ${fname} v${ver} (of ${count}) -> ${path.basename(file)}`);

  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'version not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

// PUT /api/history/restore  {fileName, version, url}  ->  {success:true}
// 恢复 = 把该版本快照写回主文件，并记为一个新版本（不丢当前状态）
function serveHistoryRestore(req, res, u) {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) {}
    const fname = path.basename(body.fileName || u.searchParams.get('file') || '');
    const ver = Number(body.version);
    const target = path.join(DOCS, fname);
    if (!fname || !Number.isInteger(ver) || ver < 1 || !fs.existsSync(target))
      return json(res, 400, { success: false, error: 'bad request' });

    const count = listVersions(fname).length;
    const src = ver >= count
      ? target
      : path.join(historyDir(fname), String(ver), 'prev' + path.extname(fname));

    fs.readFile(src, (err, data) => {
      if (err) return json(res, 404, { success: false, error: 'version not found' });
      const v = recordVersion(fname, data, { key: '', users: ['demo-user-1'] });
      json(res, 200, { success: true, version: v });
      console.log(`[history] restore ${fname} -> v${ver} (new version ${v || 'unchanged'})`);
    });
  });
}

// ---------- 3. 保存回调（status 2/6 下载结果写回 docs/，并归档版本） ----------
function serveCallback(req, res, query) {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { console.log('[callback] bad json:', e.message); }
    const status = body.status;
    // demo 把目标文件名编在回调地址查询串里（editor.html 拼好）；
    // 生产不需要：宿主后端用自己的 key -> 文档 映射即可。
    const fname = path.basename(decodeURIComponent(query.get('file') || ''));
    console.log(`[callback] status=${status} key=${body.key} file='${fname}'`);

    if ((status === 2 || status === 6) && body.url && fname) {
      http.get(body.url, dl => {
        if (dl.statusCode !== 200) { console.log('[callback] download failed: HTTP', dl.statusCode); dl.resume(); return; }
        const chunks = [];
        dl.on('data', c => chunks.push(c));
        dl.on('end', () => {
          const data = Buffer.concat(chunks);
          try {
            const v = recordVersion(fname, data, body);
            console.log(`[callback] saved ${data.length} bytes -> docs/${fname}` +
                        (v ? ` (version ${v})` : ' (unchanged)'));
          } catch (e) { console.log('[callback] write failed:', e.message); }
        });
      }).on('error', e => console.log('[callback] download failed:', e.message));
    }
    cors(req, res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 0 }));   // 无论何种状态必须回 {"error":0}
  });
}

// ---------- 1. 静态文件 ----------
function serveStatic(req, res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }   // 防目录穿越
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;
  if (req.method === 'OPTIONS') {
    cors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method === 'GET' && pathname === '/api/ectd/files/tree') return serveTree(req, res);
  if (req.method === 'GET' && pathname === '/api/ectd/link/href') return serveLinkHref(req, res, u);
  if (req.method === 'GET' && pathname === '/api/history/list') return serveHistoryList(req, res, u);
  if (req.method === 'GET' && pathname === '/api/history/file') return serveHistoryFile(req, res, u);
  if (req.method === 'PUT' && pathname === '/api/history/restore') return serveHistoryRestore(req, res, u);
  if (req.method === 'POST' && pathname === '/callback') return serveCallback(req, res, u.searchParams);
  if (req.method === 'GET') return serveStatic(req, res, pathname);
  res.writeHead(404); res.end();
}).listen(PORT, () => {
  console.log(`web-client demo: http://localhost:${PORT}/   ` +
              `(POST /callback | GET /api/ectd/files/tree | /api/ectd/link/href | ` +
              `/api/history/{list,file} | PUT /api/history/restore)`);
});
