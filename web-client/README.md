# WebClient Demo — 宿主应用集成示例

把本目录拷进宿主应用后，你得到的是「宿主前端 → 嵌入 DocumentServer 编辑器」的最小完整示例。
所有定制的编辑器能力（eCTD 文件选择器、选区链接按钮、中文链接修复、书签等）已内置在
DocumentServer 里，宿主**不需要、也不应该**复制编辑器本体。

## 目录结构

```
web-client/
├── index.html          宿主应用页：文档列表 + 连接配置 + eCTD 接口自测
├── editor.html         编辑器嵌入页（api.js + DocsAPI.DocEditor）
├── docs/               演示文档（本地联调时充当"宿主后端"的文件源/存储）
├── ectd-tree.json      ★ 宿主的 eCTD 目录树数据（改完保存，链接对话框下次打开即生效）
├── ectd-picker.html    ★ 宿主 UI 插槽参考实现（iframe 选择器 + postMessage 契约）
├── host-viewer.html    ★ 宿主阅读器占位页（点击外链时接收 ?leaf=，生产换成宿主自己的阅读器）
├── ECTD_HOST_PICKER.md ★ PDF 外链接宿主使用手册（eCTD 选择器、链接写法、dest、悬停解析、点击跳转、安全、排障）
├── serve.js            ⚠ 仅本地联调：静态服务 + 模拟宿主后端（保存回调 + 目录树接口）；纯 Node 零依赖
├── js/
│   ├── config.js       ★ 拷贝点：DS 地址、JWT、回调、eCTD 接口地址
│   ├── docs.js         ★ 拷贝点：文档清单（生产来自你的后端）
│   ├── ectd-service.js ★ 拷贝点：eCTD 契约参考实现 + 相对路径算法（原样拷贝）
│   └── jwt-dev.js      ⚠ 仅本地联调：前端临时签发 JWT，生产删除
└── README.md
```

## 本地运行

需通过 HTTP 访问（不能用 `file://` 直接打开），且**必须用自带的 `serve.js` 启动**——
它除了发静态文件，还扮演 demo 版的"宿主后端"：接收 DocumentServer 的保存回调，
把保存结果写回 `docs/`（所以在这个 demo 里，保存→刷新能看到自己的改动）：

```bash
node serve.js          # 默认 8081，可传端口参数
# 浏览器打开 http://localhost:8081/
```

前提：DocumentServer 已在本机运行（本 demo 默认 `http://localhost`，即 nginx 入口）。

演示文档由 serve.js 一并提供（`docs/` 目录），文档 url 因此写成
`http://172.17.0.1:8081/docs/...` —— **这是给 DS 服务器拉取用的**：DS 在 docker
容器里，`172.17.0.1` 是容器看到的宿主机地址（也正对应生产里"DS → 宿主后端"这条链）。
回调地址同理写成 `http://172.17.0.1:8081/callback`（见 `js/config.js`）。
若 DS 与本机不在同一台机器，把 `js/config.js` 的 `callbackUrl`、`js/docs.js` 顶部的
`WebClient.docBase` 改成两者互通的实际地址即可。

> `serve.js` 只是本地联调替身。拷进宿主应用时它由宿主后端替代——
> 后端需要实现的两件事（文档下载 + 保存回调）见第三节/第六节。

## 一、嵌入方式（前端唯一稳定契约）

宿主页面引入 `{dsBaseUrl}/web-apps/apps/api/documents/api.js`，然后：

```js
new DocsAPI.DocEditor('placeholder', {
    documentType: 'pdf',                       // 'pdf' | 'word' | 'cell' | 'slide'
    document: {
        title:    'xxx.pdf',
        url:      'https://your-backend/download/doc-123',  // ★ DS 服务器要能拉到
        fileType: 'pdf',
        key:      'doc-123-v7'                 // 文档版本指纹，同 key = 同一协同会话
    },
    editorConfig: {
        user: { id: 'u1', name: '张三' },
        mode: 'edit',
        callbackUrl: 'https://your-backend/api/onlyoffice/callback',  // ★ 保存回调
        customization: { forcesave: true }
    },
    token: '...',                              // JWT 开启时必填（见第四节）
    width: '100%', height: '100%'
});
```

不要绕过 api.js 手工拼 iframe URL —— 那是内部实现，升级即碎。

## 二、文档源契约

- `document.url` 是给 **DocumentServer 的服务器**拉取用的，不是浏览器地址；
  两者网络必须互通（DS 容器 → 宿主后端）。
- 建议返回带短期签名/一次性凭证的 URL（DS 侧会有拉取重试与缓存）。
- `key` 的规则：**内容变了 key 必须变**（否则协同会话串文档），
  常见做法 = `docId + 版本号`，或 `docId + 内容哈希`。

## 三、保存回调契约

**⚠ 先记住一条硬规则：没有 callbackUrl，保存功能直接不可用。**
DS 对未注册回调的文档会拒绝 force save（返回 NotModified），编辑器表现为
"点保存没反应"或稍后弹"保存文件时出错"。回调不是一个可选的通知机制，
而是"保存能力"本身的前置条件——所以宿主后端必须提供这个接口。

DS 在以下时机 POST `callbackUrl`（JSON）：

| status | 含义 | 宿主应做 |
|---|---|---|
| 1 | 文档被打开（进入编辑） | 可选：标记"编辑中" |
| 2 | 所有用户关闭，可保存 | **下载下面 url 的文件覆盖存储**，然后回 `{"error":0}` |
| 4 | 无改动关闭 | 可选记录 |
| 6 | 强制保存（用户点保存按钮） | **同 status 2：下载 url 持久化**。只存草稿不更新主存储 = 用户"点保存→重开恢复原样" |
| 3 / 7 | 保存出错 | 记录错误 |

不论状态，**响应体必须是 `{"error": 0}`**（非 0 = DS 认为出错）。

生产实现的推荐姿势：立刻回 `{"error":0}`，异步下载 `url` 落库（下载慢会把 DS 回调超时）。
本 demo 的参考实现就是 `serve.js` 的 `serveCallback`（status 2/6 下载并写回 `docs/`，几十行）。

## 四、JWT 契约

本 DS 的配置位置：`services.CoAuthoring.secret.*`（inbox/outbox/session/browser）。

- 开启后（`services.CoAuthoring.token.enable.*`），前端 config 必须带 `token`。
- token = HS256，**payload = 整个 config 对象**，secret = DS 的 secret。
- **签发必须在宿主后端**：前端把文档信息发给后端 → 后端签发 → 回传前端。
  `js/jwt-dev.js` 只是本地联调用的等价物（需要把 secret 填在配置面板），生产删除。
- 当前部署 JWT 为**关闭**状态，留空即可运行；对接时以你实际环境的开关为准。

## 五、eCTD 接口契约（宿主侧）

链接对话框的「eCTD 文件选择器」目录树**由宿主决定**。编辑器已接线，行为分三种：

| 场景 | 编辑器行为 |
|---|---|
| 配置了 `pickerUrl` | 宿主提供完整选择器 UI（iframe），数据源、UI、鉴权全归宿主 |
| 配置了 `treeUrl` + `currentDocumentPath` 且可拉取 | 目录树 = 宿主实时数据，可选中文件生成相对链接 |
| 配置了但拉取失败 / 响应不合法 | 对话框内显示加载错误（**绝不用假数据顶替**） |
| 未配置 | **不显示「选择文件」按钮**，只能手工输入链接 |

两种模式二选一，`pickerUrl` 优先。下面第 2 节是内置树模式；宿主 UI 模式见第 1 节。
另：`/GoToR`、`/Launch` 外链的悬停提示可用 `resolveUrl` 把叶子 ID / 显示路径实时解析
成发布相对路径；点击时可用 `openUrl` 打开宿主阅读器（`<openUrl>?leaf=<叶子 ID>`）。
两者都是可选项，不影响链接的创建与保存，见本节第 5、6 小节。

完整使用手册（选择器协议、`dest`、`resolveUrl`、`openUrl`、安全、排障）见
[**ECTD_HOST_PICKER.md**](ECTD_HOST_PICKER.md)。

### 1. 宿主 UI 模式（`pickerUrl`，iframe 插槽）

如果宿主希望**数据源和选择器 UI 都由自己提供**，把选择器页面地址放进 `pickerUrl`：

```js
customization: {
    ectd: {
        pickerUrl:    'https://host.example.com/ectd/picker', // 绝对地址；必须允许被 DS 域 iframe 嵌入
        pickerWidth:  720,                                    // 可选，默认 720（320–2000）
        pickerHeight: 520,                                    // 可选，默认 520（240–1200）
        pickerOrigin: 'https://host.example.com',             // 可选，默认取 pickerUrl 的 origin
        currentDocumentPath: 'm1 区域行政信息/1.2-封面信/xxx.pdf' // 可选，随 init 消息传给 picker
    }
}
```

编辑器点「选择文件」后弹出对话框，里面是一个指向该地址的 `<iframe>`；宿主页面通过
postMessage 回传选择结果（`ectd:select` 带 `href` 或 `path`，PDF 目标可再带 `dest`），
编辑器校验后回填链接输入框。
因为选择器运行在宿主自己的 origin 下，数据请求是**同源请求，不需要 CORS**，鉴权直接复用宿主登录态。

要点：

- `pickerUrl` 优先级高于内置树模式；非法（非 http/https）或留空时回退到 `treeUrl`。
- 宿主页面必须允许被 DS 域嵌入（用 `frame-ancestors` 放行，不要 `X-Frame-Options: DENY`）；
  DS 为 HTTPS 时 picker 也必须是 HTTPS。
- 编辑器只接受来自该 iframe、且 origin 匹配的消息；宿主回复的 `targetOrigin` 用 init 消息的
  `event.origin`，不要用 `*`。
- 链接目标只接受 `http(s)` / `ftp` / `mailto` 绝对地址，或以 `/`、`./`、`../`
  开头的相对路径；`javascript:` / `data:` 等会被拒绝并回 `ectd:invalid`。
- 文件类链接（相对路径）**不写 `/URI`**（监管要求禁止用 URI 表达文件目标）：
  目标是 PDF（`.pdf`，忽略大小写）时写 `/S /GoToR` + `/D [ 0 /XYZ null null null ]`
  （默认打开第 1 页、承前缩放）；其它文件写 `/S /Launch`；两者都带文件规范（File Specification）。
  绝对地址仍写 `/URI`。PDF 目标可在 `ectd:select` 里带可选 `dest` 指定页码/缩放/
  Fit 类型，例如 `{page: 2, type: 'Fit'}`。详见
  [ECTD_HOST_PICKER.md](ECTD_HOST_PICKER.md) 第 4 节。
- 桌面客户端仍走原生文件对话框，`pickerUrl` 仅对浏览器生效。

**完整使用手册**（外链接配置、选择器协议、`dest`、悬停解析、鉴权、安全清单、排障表）：
[**ECTD_HOST_PICKER.md**](ECTD_HOST_PICKER.md)。

本地参考实现：`ectd-picker.html` 实现了完整契约（读取 `ectd-tree.json`、渲染树、
计算相对路径、postMessage 回传）。在 `js/config.js` 里把
`ectd.pickerUrl` 设为 `/ectd-picker.html` 即可切换。

### 2. 目录树接口（宿主后端实现）

```
GET  {treeUrl}        （编辑器 iframe 实时 fetch；鉴权随宿主会话，如 cookie）
=>   { "code": 0, "data": [ { "name": "m1 区域行政信息",
                              "children": [ { "name": "1.0-封面",
                                              "children": [ { "name": "cover.pdf" } ] } ] } ] }
```

文件夹 = 有 `children` 的节点；文件 = 仅 `name` 的叶子。
本地 demo：serve.js 提供 `GET /api/ectd/files/tree`，数据在 **`ectd-tree.json`**
（裸数组，改完保存，下次打开对话框即生效——这就是"宿主决定树内容"的开关）。

### 3. 当前文档路径（内联下发，无需接口）

宿主打开编辑器时自然知道在打开哪个文档，直接放进 config：

```js
customization: {
    ectd: {
        treeUrl:             'https://host.example.com/api/ectd/files/tree',  // 绝对地址
        currentDocumentPath: 'm1 区域行政信息/1.2-封面信/xxx.pdf'
    }
}
```

注意 `treeUrl` 必须是**绝对地址**：fetch 发生在编辑器 iframe（DS 域）里，
相对路径会被解析到 DS 域下。且宿主接口必须开 **CORS**（允许 DS 域的跨域请求，
`credentials: 'include'` 时需回显 Origin + `Allow-Credentials`）。
鉴权走宿主自己的会话体系（cookie）或直接把短期令牌拼进 treeUrl。

### 4. 相对路径算法

`ectd-service.js` 里的 `getRelativePath(fromPath, toPath)` 是纯函数（编辑器内同款实现），
保证结果以 `./` 或 `../` 开头（无歧义链接）。

### 5. 外链悬停解析接口（`resolveUrl`，可选）

PDF 里的 `/GoToR`、`/Launch` 外链，`/F` 里存的可能不是真实路径，而是稳定的
**eCTD 叶子 ID**（如 `l-537aba45-1971-437a-8b72-d1a514d36aec`），或本次会话中尚未
保存的**选择器显示路径**（如 `./@0001/1.2 封面信/3.pdf`）。用户悬停链接、或在
「编辑链接」里查看已有外链时，编辑器可以调用宿主接口把它**实时**换成发布相对路径显示
（目标文件改名/移动后，下次打开即显示新路径；PDF 本身不需要改）。

```js
customization: {
    ectd: {
        // 只在从 eCTD 树打开、且知道当前叶子时下发；不配 = 提示里显示原始 /F
        resolveUrl: 'https://host.example.com/api/ectd-link/href?token=<JWT>'
    }
}
```

请求（编辑器 iframe 内 `fetch`，发生在悬停/点击/打开「编辑链接」时；**不带额外
Authorization 头**）：

```
GET {resolveUrl}&leafId=l-537aba45-1971-437a-8b72-d1a514d36aec
GET {resolveUrl}&target=<encodeURIComponent(/F 原值)>
```

`leafId=` 用于 `/F` 已是叶子 ID 的已保存文档；`target=` 用于 `/F` 是相对显示路径
（`./`、`../`、`@<序列号>/`、`/@<序列号>/`）的本会话新链接。其它值（普通绝对地址、
`/URI` 链接）不发请求。

`resolveUrl` 自带查询串时用 `&` 追加；没有查询串时用 `?`。鉴权走 URL 里的短期令牌
或宿主会话 cookie（`credentials: 'include'`，接口需按 CORS 契约回显 Origin 并允许凭证）。

成功响应（`leafId` 必须返回，点击外链要用它拼宿主阅读器地址）：

```json
{ "code": 0, "data": { "href": "../../1.2 封面信/封面信 & 截图 #1.pdf",
                       "leafId": "l-537aba45-1971-437a-8b72-d1a514d36aec" } }
```

`href` 是**相对当前文档目录的 POSIX 相对路径**，可含中文、空格、`&`、`#`。
编辑器只把它当纯文本显示：不拼 URL、不再编码，超过 256 字符截断。

行为约定：

- 只有 `/F`（或 `ToolTip`）匹配叶子 ID 正则
  `/^l-[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i`，或 `/F` 匹配相对显示路径时才发请求；
  其它值（普通路径、`/URI` 链接）行为完全不变，不发任何请求。
- 提示首行按链接类型决定：叶子 ID（未缓存）→「正在解析链接…」（**不显示叶子 ID**），
  成功后原地换成 `href`；相对显示路径 → 首帧直接显示该路径，请求只预热点击缓存，
  仅当 `href` 是同一路径的另一种斜杠写法时才回填，避免等价写法跳变；
  已缓存的叶子 → 直接显示 `href`。
  解析失败 → 首行换成「无法解析目标路径」，**保留 Ctrl 点击提示**（叶子链接的点击
  不依赖解析）；鼠标已移开/移到别的链接则丢弃过期响应，不会串提示。
- 按解析键（叶子 ID 或 `t:<显示路径>`）缓存（编辑器会话内有效），并发请求去重：
  首次悬停可能稍等，再次悬停直接命中；同一缓存供点击复用，悬停过的链接点击不再请求。
- 3 秒超时；4xx/5xx、网络错误、JSON 不合法、超时 → 悬停显示「无法解析目标路径」，
  并做约 30 秒负缓存（期间只显示该文案、不再请求）；未配置 `resolveUrl` 时保持
  原始值显示。点击失败只 `console.warn('[eCTD] ...')`，不打开任何页面。
- 只影响悬停提示、点击和「编辑链接」的显示，解析本身不向 PDF 写任何内容。
- **「编辑链接」回显**：PDF 编辑模式下右键已有文件外链 →「编辑链接」，「Link to」
  先显示叶子 ID，解析成功后原地换成发布相对路径。不改动点确定 → 保存后 `/F` 仍是
  原叶子 ID，`/D`（页/缩放，含 null 参数）原样保留；手工改成别的文件 → 走正常保存
  逻辑；解析失败/超时 → 输入框保留叶子 ID，不弹错、3 秒内可继续操作。
- 兼容编辑和查看两种模式；`/GoToR` 与 `/Launch` 都生效。
- `resolveUrl` 里可能含令牌，编辑器不会把它打到控制台；宿主也应注意接口日志脱敏。

本地演示：`serve.js` 提供 mock 接口 `GET /api/ectd/link/href`（数据见 `MOCK_LINKS`
和 `MOCK_TARGETS`），文档列表里的「外链悬浮提示示例.pdf」带 4 个链接
（GoToR 叶子 ID / Launch 叶子 ID / URI / GoToR 显示路径）。
联调降级时给 `resolveUrl` 加 mock 参数：`fail=401|500|400`、`delay=<毫秒>`
（例如 `js/config.js` 里改成 `/api/ectd/link/href?token=demo-token&delay=5000`
可验证 3 秒超时与负缓存）。

### 6. 外链点击打开宿主阅读器（`openUrl`，可选）

配置 `openUrl` 后，eCTD 会话里点击文件外链不再 `window.open(/F 原值)`，而是打开
宿主自己的阅读器，与宿主 pdf.js 的行为一致：

```js
customization: {
    ectd: {
        openUrl:    'https://host.example.com/pdf/web/viewer.html',  // 阅读器页面（绝对地址，不带 #）
        resolveUrl: 'https://host.example.com/api/ectd-link/href?token=<JWT>'
    }
}
```

| 点击的链接 | 行为 |
|---|---|
| `/F` 已是叶子 ID（已保存文档） | 同步打开 `<openUrl>?leaf=<leafId>`，不发解析请求 |
| `/F` 是相对显示路径（本会话新链接） | 先 `resolveUrl&target=...` 换到 `leafId`，再打开 `<openUrl>?leaf=<leafId>` |
| 普通 `http(s)` / `mailto` 等绝对地址 | 不变：原安全提示 + 直接打开原地址 |
| 非 eCTD 会话 / 没配 `openUrl` | 不变：原行为 |

- 异步解析时编辑器会先同步预留一个空白标签页，解析成功后导航，避免被弹窗拦截；
  失败（400/401/超时/缺 `leafId`）关闭空白页，只 `console.warn`，**不会**打开 `/F` 原值。
- `openUrl` 可以带查询串（编辑器用 `&` 追加 `leaf`），**不要带 `#fragment`**。
- 宿主阅读器按 `?leaf=` 自行取文档和鉴权；`leaf` 是不可信输入，必须按用户权限校验。
- 保存时 `/F` 仍写叶子 ID；本功能不改变 PDF 内容，也不影响 `/URI` 链接。

完整时序、失败约定与排障见 [ECTD_HOST_PICKER.md](ECTD_HOST_PICKER.md) 第 7 节。

## 六、版本历史契约（宿主侧）

**Version History 是宿主功能，不是编辑器自带能力。** 编辑器只在宿主 attach 了
`onRequestHistory` 事件时才显示 File → Version History
（`api.js`: `canUseHistory = events && !!events.onRequestHistory`）。
只配 `callbackUrl` 不会出现这个按钮——回调负责"保存"，历史列表要宿主另给数据。

### 1. 前端四个事件（editor.html 已接线）

> ⚠ 事件挂在 DocEditor 配置的**顶层** `config.events`（与 `document`、
> `editorConfig` 同级），不是 `editorConfig.events`。放错位置编辑器拿不到，
> 按钮/点版本/恢复全部静默失效。

```js
config.events = {
    onRequestHistory:      function () {        // 拉列表
        // GET /api/history/list → docEditor.refreshHistory({currentVersion, history})
    },
    onRequestHistoryData:  function (event) {   // event.data = version（数字）
        // docEditor.setHistoryData(historyData[version - 1])
    },
    onRequestHistoryClose: function () { document.location.reload(); },
    onRequestRestore:      function (event) {   // event.data = {version, url}
        // PUT /api/history/restore → 成功后重新拉列表并 refreshHistory
    }
};
```

四个事件缺一不可：少了 `onRequestHistory` 按钮直接隐藏；少了
`onRequestHistoryData` 点版本没反应；少了 `onRequestRestore` 没有恢复入口。

### 2. 宿主后端三个接口（与官方 example 同形状）

```
GET  /api/history/list?file=xxx
=>   { "countVersion": 2,
       "history":     [ { "version": 1, "key": "...", "created": "2026-10-21 10:00:00",
                          "user": {"id":"u1","name":"张三"} }, ... ],
       "historyData": [ { "fileType": "pdf", "version": 1, "key": "...",
                          "url": "https://host/api/history/file?file=xxx&ver=1",
                          "directUrl": null }, ... ] }

GET  /api/history/file?file=xxx&ver=N     // 该版本快照，给 DS 服务器下载
PUT  /api/history/restore                 // {fileName, version, url} → {"success":true}
```

`historyData[i].url` 必须是 **DS 服务器能访问的地址**（容器 → 宿主后端），
它和历史版本的 `key` 一起交给历史查看器渲染。

> ⚠ 版本的 `key` 会进 websocket 路径 `/doc/<key>/c`，必须是 **URL 路径安全**的
> （只含字母数字、`.`、`_`、`-`）。含空格/中文会让 DS 回 404/400，编辑器一直卡在
> 「正在打开文件」。demo 的初始版本 key 由 `hostKey()` 生成（文件名里的非法字符替换为 `_`）。
>
> ★ 同时，**每个版本的 `key` 必须唯一**。DS 按 key 缓存已下载的文档：两个版本共用
> 一个 key 时，后打开的那个不会重新向宿主下载，而是直接复用第一次缓存的内容
> （往往是编辑会话开始时的原始文件）——表现就是「最上面的版本与当前文件内容不一致」。
> 保存回调返回的 `key` 是**编辑会话 key**，同一会话多次保存（status 6 → 2）必然重复，
> 不能直接存为版本 key。demo 的 `versionKey()` 统一加 `-v<N>` 后缀；旧 meta 里的重复
> key 由 `normalizeKey()` 在读取时归一化，下次保存写回完成迁移。

### 3. 存储布局（与 example 一致）

```
docs/<file>                          当前版本
docs/<file>-history/meta.json        版本元数据 [{version,key,created,user}]
docs/<file>-history/<N>/prev.<ext>   版本 N 的快照（离开版本 N 时归档）
```

**保存回调每落盘一次（status 2/6）都要归档上一状态并追加一个版本**
——demo 的 `recordVersion()` 就是这段逻辑。不归档的话，历史里的版本号
永远不动，"操作历史"看不到新增记录。

> demo 实现：`serve.js` 的 `recordVersion / serveHistoryList / serveHistoryFile /
> serveHistoryRestore`；前端在 `editor.html` 的顶层 `config.events`。

## 七、拷进宿主应用时的清单

1. 三个拷贝点：
   - `js/config.js` → 改成宿主的 DS 地址 / 回调地址 / eCTD 接口地址；
   - `js/docs.js` → 改成从宿主后端拿文档列表（文档的 ectdPath 一并给出）；
   - `js/ectd-service.js` → `getRelativePath` 原样拷走（纯函数）；
     目录树数据由后端 `GET treeUrl` 提供（形状见第五节），不再走页面侧 fetchTree。
2. 宿主后端补齐四件事：**文档下载接口**（给 DS 拉）+ **保存回调接口**（见第三节）
   + **eCTD 目录树接口**（见第五节）+ **版本历史接口**（见第六节）。
   本地 demo 的 `serve.js` 就是这四件事的最小实现（纯 Node 零依赖），
   可直接对照/移植。**回调接口不是可选项**——缺了它保存功能会被 DS 直接拒绝。
3. JWT 开启时：后端加签发逻辑（第四节），前端 token 塞进 config；删除 `jwt-dev.js`。
4. 跨域：api.js / 编辑器 iframe / 回调是三个不同方向，按宿主实际域名核对
   （编辑器 iframe 由 DS 域提供，宿主后端接口需要允许来自 DS 域的请求，
   或改用 postMessage 桥由宿主页面代发请求——见 `ectd-service.js` 的替换示例注释）。

## 八、常见问题

- **编辑器一直转圈**：文档 url 从 DS 服务器侧拉不到。在 DS 容器里 `curl` 一下 url 验证。
- **看不到 File → Version History**：宿主没 attach `events.onRequestHistory`
  （见第六节）。注意官方 `/example` 页面是有这个按钮的——它是宿主接线的参考实现。
- **点保存没反应 / 弹"保存文件时出错"**：callbackUrl 没配（DS 直接拒绝保存），
  或回调地址 DS 服务器侧访问不通。demo 里检查 `serve.js` 是否在运行、控制台有无 `[callback]` 日志。
- **改了内容但保存后没变**：回调没正确落盘，或回调没回 `{"error":0}`。
- **点保存没改动时无动作**：DS 默认 `forceSaveUsingButtonWithoutChanges=false`，无修改时不产生保存——正常现象。
- **两个人打开同一文档互相覆盖**：key 不一致被当成两份文档，或宿主两处开了不同 key。
- **浏览器缓存旧编辑器**：DS 侧发版已做 cache 轮换，宿主无需处理；强刷一次即可。
