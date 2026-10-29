# PDF 外链接 —— 宿主接入使用手册

> 适用：本仓库定制的 DocumentServer 9.4.0（PDF 编辑器）
> 最后验证：2026-10-28，镜像内 E2E 通过（宿主 UI 模式、内置树模式、`dest`、
> `resolveUrl` 悬停解析状态机、`openUrl` 点击跳转、编辑链接回显；悬停 90 项 +
> 点击 35 项 + 编辑链接 60 项检查）
> 参考实现：`ectd-picker.html`（宿主选择器）、`serve.js`（mock 宿主后端）、
> `host-viewer.html`（宿主阅读器占位页）、`docs/link-tooltip-demo.pdf`（外链演示文档）
>
> 文件名 `ECTD_HOST_PICKER.md` 为历史原因保留，内容覆盖 eCTD 选文件与外链接的全部接入能力。

## 目录

1. 外链接概览与宿主职责
2. 快速接入与配置（内置树 / 宿主 UI 插槽 / 字段总表）
3. 宿主 UI 插槽协议（消息、`href`/`path`、targetOrigin、最小骨架）
4. PDF 底层写法与 `dest`（`/GoToR` / `/Launch` / `/URI`）
5. 内置目录树模式（`treeUrl` 契约与相对路径）
6. 外链悬停提示（`resolveUrl`）
7. 外链点击与宿主阅读器（`openUrl`）
8. 安全清单
9. 本地 demo 与联调
10. 排障
11. 版本与兼容
12. 相关文件

---

## 1. 外链接概览与宿主职责

PDF 编辑器里的「外链接」指指向文档外部目标的链接。按目标分三类（PDF 底层写法见第 4 节）：

| 链接目标 | 典型值 | 保存后的 PDF 动作 |
|---|---|---|
| 网页 / 绝对地址 | `https://example.com/x`、`mailto:a@b.c` | `/URI` |
| 另一个 PDF（相对路径） | `./x.pdf`、`../1.2 封面信/x.pdf` | `/GoToR`（默认第 1 页、承前缩放） |
| 其它文件（相对路径） | `./x.docx`、`../附件/x.xlsx` | `/Launch` |

**监管要求（硬规则）**：目标为**文件**的外链接不允许用 `/URI`。
因此相对路径链接一律写 `/GoToR`（PDF）或 `/Launch`（其它文件）；只有绝对地址写 `/URI`。

宿主有五个接入点（配置项通过 `editorConfig.customization.ectd` 下发，`dest` 随
`ectd:select` 消息回传）：

1. **提供文件源/选择器**：`pickerUrl`（宿主 UI 插槽）或 `treeUrl` + `currentDocumentPath`（内置树）。
2. **告诉编辑器当前文档在哪**：`currentDocumentPath`（内置树模式必填）。
3. **指定 PDF 跳转位置**：在 `ectd:select` 消息里带 `dest`（仅 PDF 目标）。
4. **悬停时解析叶子 ID**：`resolveUrl`（把 `/F` 里的稳定 ID 换成发布相对路径显示）。
5. **点击时打开宿主阅读器**：`openUrl`（不再打开 `/F` 原值，而是打开
   `<openUrl>?leaf=<叶子 ID>`，与宿主 pdf.js 的行为一致）。

职责边界：

- **编辑器负责**：链接对话框、选择结果校验、相对路径计算、写 PDF 动作、保存时保留已有动作；
  悬停显示解析结果；点击时把叶子 ID 交给宿主阅读器。
- **宿主负责**：文件数据源/选择器 UI、鉴权、当前文档路径、可选的解析接口和阅读器页面。
- 宿主**不需要**自己拼 PDF Annotation，也**不需要**修改 PDF 文件。

用户侧入口（供宿主编写用户文档时参考，均需在编辑模式下）：

- 选中文本/区域后点浮动工具栏「链接」，或按 `Ctrl+K`，打开链接对话框；
- 在 URL 输入框直接输入，或点「选择文件」从 eCTD 目录树/宿主选择器选文件；
- 选中后编辑器只回填 URL，**不会自动点「确定」**；保存文档后才写入 PDF。

---

## 2. 快速接入与配置

### 2.1 方式 A：内置目录树（最快）

宿主提供一个目录树接口，编辑器用内置 UI 渲染：

```js
editorConfig: {
    customization: {
        ectd: {
            treeUrl: 'https://host.example.com/api/ectd/files/tree', // 绝对地址
            currentDocumentPath: 'm1 区域行政信息/1.2-封面信/cover.pdf'
        }
    }
}
```

接口返回 `{ "code": 0, "data": [目录树] }`，契约见 5.1。
`treeUrl` 必须是绝对地址且允许 CORS——fetch 发生在编辑器 iframe（DS 域）里。

### 2.2 方式 B：宿主 UI 插槽（`pickerUrl`）

宿主自带选择器页面，编辑器只负责弹窗和收结果：

```js
editorConfig: {
    customization: {
        ectd: {
            pickerUrl: 'https://host.example.com/ectd/picker?docId=123', // 绝对地址
            pickerWidth:  720,        // 可选，320–2000，默认 720
            pickerHeight: 520,        // 可选，240–1200，默认 520
            pickerOrigin: 'https://host.example.com', // 可选，默认取 pickerUrl 的 origin

            // 可选（推荐）：当前 PDF 在 eCTD 结构中的路径，随 init 消息传给宿主
            currentDocumentPath: 'm1 区域行政信息/1.2-封面信/cover.pdf'
        }
    }
}
```

宿主页面的界面、数据、鉴权、确认/取消全部自己实现，协议见第 3 节。

### 2.3 两种模式对比

| | 内置树（`treeUrl`） | 宿主 UI 插槽（`pickerUrl`） |
|---|---|---|
| 选择器 UI | 编辑器内置 | **宿主页面**（任意技术栈） |
| 数据源 | 宿主接口 | 宿主页面自己取 |
| 数据请求位置 | 编辑器 iframe（DS 域）→ 宿主接口，**必须开 CORS** | 宿主页面自身（同源），**不需要 CORS** |
| 鉴权 | cookie 或把短令牌拼进 treeUrl | 宿主自己的登录态/令牌，最自然 |
| `currentDocumentPath` | **必填**（编辑器用它算相对链接） | 可选（推荐传；也可由宿主直接算好链接） |
| 配置优先级 | 低 | **高**（合法 `pickerUrl` 存在时不会用内置树） |
| 适合 | 快速接入 | 宿主已有文件浏览器、需要复杂交互或强鉴权 |

选择「文件」按钮的显示条件：`pickerUrl` 合法 **或**（`treeUrl` 且 `currentDocumentPath` 非空）。
两者都没配时按钮隐藏，只能手工输入链接。

### 2.4 配置字段总表

| 字段 | 必填性 | 说明 |
|---|---|---|
| `pickerUrl` | 与 `treeUrl` 二选一 | 宿主选择器页面**绝对地址**（仅 `http:`/`https:`）；合法时优先于内置树 |
| `pickerWidth` / `pickerHeight` | 可选 | 弹窗尺寸（像素）；默认 720×520，允许 320–2000 / 240–1200，越界按默认值 |
| `pickerOrigin` | 可选 | 消息 origin，默认取 `pickerUrl` 的 origin；选择器页面会跳转到其它 origin 时才需显式指定 |
| `treeUrl` | 与 `pickerUrl` 二选一 | 目录树接口**绝对地址**；必须配 `currentDocumentPath` 才显示按钮 |
| `currentDocumentPath` | 树模式必填；插槽模式推荐 | 当前 PDF 在 eCTD 结构中的路径（如 `m1 .../1.2-封面信/cover.pdf`）；随 `ectd:init` 传给宿主，并用于 `path` 模式计算相对链接 |
| `resolveUrl` | 可选 | 外链解析接口，悬停显示发布路径、点击时把显示路径换成叶子 ID，见第 6、7 节 |
| `openUrl` | 可选 | 宿主阅读器地址。配置后 eCTD 会话里点击文件外链打开 `<openUrl>?leaf=<叶子 ID>`；不配则保持旧行为（见 7.1） |

补充：

- `pickerUrl` / `treeUrl` / `resolveUrl` / `openUrl` 都必须是**绝对地址**。相对地址会被解析到 DS
  编辑器域（不是宿主域）；`editor.html` 用 `new URL(cfg, location.origin).href` 做转换。
- `openUrl` 只写阅读器页面本身，**不要带 `#fragment`**；查询串可以有（编辑器用 `&` 追加
  `leaf=`）。
- 非法 `pickerUrl`（协议不对等）视为未配置：若同时配了合法的
  `treeUrl + currentDocumentPath`，回退内置树；否则按钮隐藏。
- **桌面客户端不受影响**：`appOptions.isDesktopApp` 时仍走原生文件对话框，eCTD 配置被忽略。

---

## 3. 宿主 UI 插槽协议（`pickerUrl`）

### 3.1 编辑器做什么

1. 打开一个弹窗，里面是指向 `pickerUrl` 的 `<iframe>`；
2. 把当前文档上下文用 `postMessage` 发给宿主页面（`ectd:init`）；
3. 接收宿主回传的链接，校验后回填到链接对话框。

编辑器弹窗没有底部按钮（`buttons: []`），确认、取消、筛选、分页等都由宿主页面实现。

### 3.2 宿主页面要求

| 要求 | 说明 |
|---|---|
| 允许被 DS 域 iframe 嵌入 | 不要发 `X-Frame-Options: DENY/SAMEORIGIN`；用 `Content-Security-Policy: frame-ancestors https://ds.example.com;` 放行 |
| 协议对齐 | DS 是 HTTPS 时，picker 也必须 HTTPS，否则浏览器按混合内容拦截 |
| 自己提供确认/取消 | 编辑器弹窗没有底部按钮，确认、取消、筛选等都由宿主页面实现 |
| 自己处理加载失败 | 数据接口失败时在页面内提示，并可发 `{type:'ectd:error', message}` 让编辑器同步显示 |
| 不要做顶层跳转 | 页面在 iframe 里，`window.top.location = ...` 会整页跳走；需要跳转请用 `window.open` |
| 超时体验 | 编辑器只在 iframe `load` 前显示「加载中…」；load 之后的数据加载请宿主自己显示骨架/进度 |

### 3.3 消息时序

```
宿主页面（iframe）                          编辑器（PDF 编辑器）
      |                                            |
      |  页面脚本就绪（可选，先发）                    |
      |---- {type:'ectd:ready'} ------------------>|  编辑器收到后重发 init
      |<--- {type:'ectd:init', ...} ----------------|  iframe load 时也会发一次
      |                                            |
      |  用户选择文件                                |
      |---- {type:'ectd:select', href 或 path} ---->|  校验 → 关闭弹窗 → 回填链接输入框
      |---- {type:'ectd:cancel'} ------------------>|  关闭弹窗
      |---- {type:'ectd:error', message} ---------->|  弹窗内显示错误
      |<--- {type:'ectd:invalid', reason} ----------|  链接被拒绝
```

- `ectd:ready` 是可选的握手：编辑器可能在宿主监听器挂载前就发了 init，
  宿主就绪后发 ready，编辑器会**重发** init。
- init 会发两次（iframe load 时一次，收到 ready 时再发一次），宿主应保证幂等。

### 3.4 消息表

| 方向 | 消息 | 字段 | 说明 |
|---|---|---|---|
| 编辑器 → 宿主 | `ectd:init` | `currentDocumentPath`、`lang` | 当前文档路径；`lang` 是编辑器界面语言（两位小写，如 `zh`） |
| 宿主 → 编辑器 | `ectd:ready` | 无 | 监听器就绪，请求重发 init |
| 宿主 → 编辑器 | `ectd:select` | `href` **或** `path`；可选 `dest` | 见 3.5；`dest` 见 4.3（仅 PDF 目标） |
| 宿主 → 编辑器 | `ectd:cancel` | 无 | 关闭选择器弹窗，不修改链接 |
| 宿主 → 编辑器 | `ectd:error` | `message` | 在弹窗内显示错误文案 |
| 编辑器 → 宿主 | `ectd:invalid` | `reason` | 回传的链接被拒绝（伪协议、缺当前路径、超长等） |

### 3.5 回传链接：`href` 还是 `path`

**宿主已有可靠相对路径 → 直接回 `href`**

```js
window.parent.postMessage({
    type: 'ectd:select',
    href: './3.2.P-制剂/3.2.P.7-包装材料.pdf',
    path: 'm3 质量/3.2.P-制剂/3.2.P.7-包装材料.pdf'   // 可选，便于宿主自己审计
}, editorOrigin);
```

`href` 白名单（编辑器侧强制校验）：

- 绝对地址：`http(s)://`、`ftp://`、`mailto:`；
- 相对路径：以 `/`、`./`、`../` 开头；
- 拒绝：`javascript:` / `data:` 等伪协议、控制字符、反斜杠、长度 > 2083。

**不想自己算 → 只回 `path`**

```js
window.parent.postMessage({
    type: 'ectd:select',
    path: 'm3 质量/3.2.P-制剂/3.2.P.7-包装材料.pdf'
}, editorOrigin);
```

编辑器用 `currentDocumentPath` 计算相对路径（结果以 `./` 或 `../` 开头）。
没有配置 `currentDocumentPath` 时会回 `ectd:invalid`，链接不会回填。

### 3.6 targetOrigin

- 宿主收到 `ectd:init` 后，记下 `event.origin`（DS 编辑器域），后续所有带数据的回复都用它作为 `targetOrigin`；
- **不要用 `'*'`**（只有不带数据的首次 `ectd:ready` 握手可以用 `'*'`）；
- 编辑器只接受 `event.source === iframe.contentWindow` 且 `event.origin === pickerOrigin` 的消息，
  origin 不匹配会被静默丢弃。

### 3.7 最小宿主页面骨架

```js
let editorOrigin = null;
let currentDocumentPath = '';

window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'ectd:init') {
        editorOrigin = event.origin;               // DS 编辑器域，仅用于回复
        currentDocumentPath = data.currentDocumentPath || '';
    } else if (data.type === 'ectd:invalid') {
        showError('编辑器拒绝了该链接：' + (data.reason || 'unknown'));
    }
});

function getRelativePath(fromPath, toPath) {
    const from = fromPath.split('/'); from.pop();
    const to = toPath.split('/');
    let i = 0;
    while (i < from.length && i < to.length - 1 && from[i] === to[i]) ++i;
    const parts = [];
    for (let u = i; u < from.length; ++u) parts.push('..');
    parts.push(...to.slice(i));
    const rel = parts.join('/');
    return rel.indexOf('../') === 0 ? rel : './' + rel;
}

function confirmSelection(selectedPath) {
    if (!editorOrigin) return showError('尚未与编辑器建立消息通道');
    window.parent.postMessage({
        type: 'ectd:select',
        href: currentDocumentPath ? getRelativePath(currentDocumentPath, selectedPath) : undefined,
        path: selectedPath
    }, editorOrigin);
}

function cancel() {
    if (editorOrigin) window.parent.postMessage({ type: 'ectd:cancel' }, editorOrigin);
}

// 可选握手（脚本加载后立即发，不带数据，用 '*' 即可）
window.parent.postMessage({ type: 'ectd:ready' }, '*');
```

完整可运行版本（树渲染、筛选、双击选择、错误提示）见 **`ectd-picker.html`**。

### 3.8 鉴权建议

- 选择器 iframe 的顶层页面是宿主应用，宿主登录 cookie 通常按同站请求发送；
- 如果编辑器可能被**单独打开**（顶层是 DS 域），改用 URL 短时令牌或
  `SameSite=None; Secure`；
- 生产不要在 URL 里放长期令牌（会进日志/Referer），用一次性或短期签名令牌。

---

## 4. PDF 底层写法与 `dest`

宿主回填的链接在保存时按目标类型分流，**不需要宿主自己写动作**。

### 4.1 目标类型分流

| 链接值 | PDF 底层写法 |
| --- | --- |
| 绝对地址（`http://`、`https://`、`ftp://`、`mailto:`） | `/Subtype /Link` 注解 + `/A << /S /URI /URI (...) >>` |
| 相对路径，扩展名为 `.pdf`（忽略大小写） | `/Subtype /Link` 注解 + `/A << /S /GoToR /F <文件规范> /D [ 0 /XYZ null null null ] >>`（默认） |
| 相对路径，目标不是 PDF | `/Subtype /Link` 注解 + `/A << /S /Launch /F <文件规范> >>` |

`/GoToR` 的默认 `/D [ 0 /XYZ null null null ]` 表示：打开目标 PDF 的**第 1 页**（页面索引 0），
位置与缩放三个参数均为 `null`，即**承前缩放**（保持阅读器当前缩放级别）。
宿主可以用 `dest` 覆盖（见 4.3）。

**监管要求：文件目标不允许用 URI 表达**。因此 eCTD 选择器生成的所有相对路径链接
（以及用户手工输入的同形态相对路径）一律写为 `/GoToR`（PDF）或 `/Launch`（其它文件），
不存在指向文件的 `/URI`。只有绝对地址才写 `/URI`。

### 4.2 文件规范编码

- 纯 ASCII 路径：`/F (../1.0-封面/cover.pdf)`（作为字符串）；
- 含非 ASCII 字符：`/F << /Type /Filespec /F (UTF-8 八进制转义) /UF (UTF-16BE 八进制转义) >>`。

### 4.3 指定 PDF 目标位置（`dest`）

宿主在 `ectd:select` 里带可选 `dest`，编辑器把它写进 `/GoToR` 的 `/D` 数组；
不带 `dest` 时保持默认 `[ 0 /XYZ null null null ]`（第 1 页、承前缩放）。
内置目录树模式不经过 `ectd:select`，因此 `dest` 只适用于宿主 UI 插槽模式，
或直接调用下方的编辑器 API。

```js
window.parent.postMessage({
    type: 'ectd:select',
    href: './3.2.P-制剂/3.2.P.7-包装材料.pdf',
    dest: { page: 2, type: 'XYZ', left: null, top: null, zoom: 1.5 }
}, editorOrigin);
```

写入的 PDF：

```pdf
/A << /S /GoToR /F (...) /D [ 2 /XYZ null null 1.5 ] >>
```

`dest` 字段：

| 字段 | 适用类型 | 说明 |
|---|---|---|
| `page` | 全部 | **必填**。目标 PDF 的页索引，**从 0 开始**（0 = 第 1 页） |
| `type` | 全部 | 可选，默认 `XYZ`；`XYZ` / `Fit` / `FitH` / `FitV` / `FitR` / `FitB` / `FitBH` / `FitBV`（忽略大小写） |
| `left` | `XYZ`、`FitV`、`FitBV`、`FitR` | 横向坐标；`XYZ` 里 `null` = 保持阅读器当前位置 |
| `top` | `XYZ`、`FitH`、`FitBH`、`FitR` | 纵向坐标；`XYZ` 里 `null` = 保持位置 |
| `zoom` | `XYZ` | 缩放倍率；`null` = 承前缩放（保持阅读器当前缩放） |
| `right` / `bottom` | `FitR` | 矩形右下角；`FitR` 的四个值都必须是非 null 数字 |

坐标使用 **PDF 目标页的默认用户空间**（原点在页面左下角，单位 pt），即 PDF
规范 Table 151 的语义，不做任何转换。`FitH` / `FitBH` 只取 `top`，`FitV` / `FitBV`
只取 `left`。只跳页、保持当前缩放的最简写法：

```js
dest: { page: 2 }                       // => /D [ 2 /XYZ null null null ]
```

约束与校验（不满足时编辑器回 `ectd:invalid`，弹窗不关闭、链接不回填）：

- `page` 必须是 **≥ 0 的整数**；目标 PDF 的页数编辑器无法预知，页越界由宿主保证。
- 只允许用于**相对路径且目标为 `.pdf`** 的链接（即写入 `/GoToR` 的那些链接）；
  绝对地址（`/URI`）或非 PDF 目标带 `dest` 会被拒绝。
- 数值字段必须是有限数字或 `null`（`FitR` 的四个角必须都是数字）。
- `dest` 只作用于本次选择的链接；用户若随后手工修改链接 URL，`dest` 自动丢弃。
- 目前只支持显式数字目的地，不支持命名目的地（`/D (name)`）或 JavaScript 动作。

宿主也可以在调用编辑器 API 时直接设置：`props.put_Dest({page: 2, type: 'Fit'})`
（`Asc.CHyperlinkProperty`），行为与 picker 通道一致。

参考实现 `ectd-picker.html` 支持在目录树节点上写可选 `dest`，选中后原样回传：

```json
{ "name": "cover.pdf", "dest": { "page": 2, "type": "Fit" } }
```

### 4.4 已知限制

浏览器端 PDF 阅读器（WebAssembly 解析层）目前不解析 `/Launch` / `/GoToR` 动作，
引擎自身无法把这类动作回显到链接对话框；定制层会额外读取原始 `/A` 的 `/F`、`/D`，
配合 `resolveUrl` 在「编辑链接」里回显发布相对路径（见 6.6）。保存时编辑器会原样保留
文档里已有的 `/A`，链接不会丢失（已做「打开含文件动作的 PDF → 再加链接 → 保存」回归验证）。
悬停提示仍可用（见第 6 节），显示的是链接原始 `/F` 或解析后的发布路径。

---

## 5. 内置目录树模式（`treeUrl`）

### 5.1 目录树接口契约

```
GET  {treeUrl}        （编辑器 iframe 实时 fetch；鉴权随宿主会话，如 cookie）
=>   { "code": 0,
       "data": [ { "name": "m1 区域行政信息",
                   "children": [ { "name": "1.0-封面",
                                   "children": [ { "name": "cover.pdf" } ] } ] } ] }
```

文件夹 = 有 `children` 的节点；文件 = 仅 `name` 的叶子。

- `treeUrl` 必须是**绝对地址**（fetch 在 DS 域 iframe 里，相对路径会解析到 DS 域）。
- 宿主接口必须开 **CORS**：允许 DS 域跨域；`credentials: 'include'` 时需回显 Origin
  并返回 `Access-Control-Allow-Credentials: true`。
- 请求失败或响应不合法时，对话框内显示加载错误，**绝不用假数据顶替**。
- 本地 demo：`serve.js` 提供 `GET /api/ectd/files/tree`，数据在 **`ectd-tree.json`**
  （裸数组，改完保存，下次打开对话框即生效——这就是"宿主决定树内容"的开关）。

### 5.2 当前文档路径与相对路径算法

`currentDocumentPath` 内联下发，不需要接口：

```js
customization: {
    ectd: {
        treeUrl:             'https://host.example.com/api/ectd/files/tree',
        currentDocumentPath: 'm1 区域行政信息/1.2-封面信/xxx.pdf'
    }
}
```

- 内置树模式**必填**（否则「选择文件」按钮不显示）。
- 宿主 UI 模式下随 `ectd:init` 传给宿主，供宿主回传 `path` 时使用。
- `path` 模式由编辑器计算相对路径，算法与 `js/ectd-service.js` 的
  `getRelativePath(fromPath, toPath)` 一致：去掉当前文档文件名，取公共目录前缀，
  剩余目录用 `..` 回退，结果保证以 `./` 或 `../` 开头（无歧义链接）。

---

## 6. 外链悬停提示（`resolveUrl`，可选）

### 6.1 解决什么问题

PDF 里的 `/GoToR`、`/Launch` 外链，`/F` 里存的可能不是真实路径，而是稳定的
**eCTD 叶子 ID**（如 `l-537aba45-1971-437a-8b72-d1a514d36aec`），或者本次会话中尚未
保存的**选择器显示路径**（如 `./@0001/1.2 封面信/3.pdf`）。用户悬停链接、或在
「编辑链接」里查看已有外链时，编辑器可以调用宿主接口把它**实时**换成发布相对路径显示
（目标文件改名/移动后，下次打开即显示新路径；PDF 本身不需要改）。

### 6.2 配置与请求

```js
customization: {
    ectd: {
        // 只在从 eCTD 树打开、且知道当前叶子时下发；不配 = 提示里显示原始 /F
        resolveUrl: 'https://host.example.com/api/ectd-link/href?token=<JWT>'
    }
}
```

请求（编辑器 iframe 内 `fetch`，发生在悬停时；**不带额外 Authorization 头**）有两种：

```
GET {resolveUrl}&leafId=l-537aba45-1971-437a-8b72-d1a514d36aec
GET {resolveUrl}&target=<encodeURIComponent(/F 原值)>
```

- `/F` 已经是叶子 ID → 用 `leafId=`（已保存文档的常态）；
- `/F` 是相对显示路径 → 用 `target=`，原值必须 URL 编码。支持的形式：
  `./...`、`../...`、`@<序列号>/...`、`/@<序列号>/...`（如 `./@0001/1.2 封面信/3.pdf`）。
- 普通绝对地址、`/URI` 链接、`mailto:` 等不发请求。

`resolveUrl` 自带查询串时用 `&` 追加；没有查询串时用 `?`。鉴权走 URL 里的短期令牌
或宿主会话 cookie（`credentials: 'include'`，接口需按 CORS 契约回显 Origin 并允许凭证，
与 `treeUrl` 相同）。

### 6.3 响应与展示

成功响应（**`leafId` 必须返回**：悬停用它缓存，点击直接用它拼宿主阅读器地址）：

```json
{
  "code": 0,
  "data": {
    "href": "../../1.2 封面信/封面信 & 截图 #1.pdf",
    "leafId": "l-537aba45-1971-437a-8b72-d1a514d36aec"
  }
}
```

`href` 是**相对当前文档目录的 POSIX 相对路径**，可含中文、空格、`&`、`#`。
编辑器只把它当纯文本显示：不拼 URL、不再编码，超过 256 字符截断。
`leafId` 是目标文件当前的稳定叶子 ID，后续点击外链时直接用它打开宿主阅读器。

行为约定：

- 只有 `/F`（或 `ToolTip`）匹配叶子 ID 正则，或 `/F` 匹配上面的相对显示路径时
  才发请求；其它值（普通绝对地址、`/URI` 链接）行为完全不变，不发任何请求。
- 提示首行按链接类型决定：
  - `/F` 是叶子 ID（未缓存）：显示「正在解析链接…」，**叶子 ID 不会出现在提示里**；
    解析成功后原地换成 `href`；已缓存则直接显示 `href`，不再请求；
  - `/F` 是相对显示路径：首帧直接显示该路径（带自定义 `ToolTip` 时显示 `ToolTip`，
    与编辑器原行为一致）；后台请求预热点击缓存，只有 host 返回的路径与首行内容
    仅差斜杠写法（`\` ↔ `/`）时才回填，其它情况保持首帧内容，不产生文本跳变；
    解析失败则换成失败文案；
  - 解析失败（4xx/5xx、网络错误、JSON 不合法、超时）：首行换成「无法解析目标路径」，
    **Ctrl 点击提示保留**（叶子 ID 链接的点击不依赖解析）；约 30 秒负缓存期内
    重复悬停只显示该文案、不再发请求；未配置 `resolveUrl` 时不解析，提示保持原始 `/F`。
- 叶子 ID 链接解析成功后若鼠标仍停在同一链接上，提示**原地更新**为 `href`，
  保留 Ctrl 点击提示；鼠标已移开/移到别的链接则丢弃过期响应，不会串提示。
- 只影响悬停提示、「编辑链接」对话框的显示和点击，解析本身不向 PDF 写任何内容；
  「编辑链接」保存时如何保留原始 `/F`、`/D` 见 6.6。
- 兼容编辑和查看两种模式；`/GoToR` 与 `/Launch` 都生效。

### 6.4 缓存、超时与降级

- 按解析键缓存（叶子 ID 或 `t:<显示路径>`，编辑器会话内有效），并发请求去重：
  首次悬停可能稍等，再次悬停直接命中。
- 同一份缓存同时供悬停、点击和「编辑链接」使用：悬停解析过的链接，点击或打开
  Link settings 时不再请求。
- 3 秒超时；4xx/5xx、网络错误、JSON 不合法、超时 → 悬停提示显示
  「无法解析目标路径」（解析期间叶子 ID 链接显示「正在解析链接…」，从不暴露叶子 ID），
  并做约 30 秒负缓存（期间不再发请求）；未配置 `resolveUrl` 时保持原始值显示。
  点击失败只在控制台 `console.warn('[eCTD] ...')`，不打开任何页面。
- `resolveUrl` 里可能含令牌，编辑器不会把它打到控制台；宿主也应注意接口日志脱敏。

### 6.5 宿主接口要求

- 返回 `{ "code": 0, "data": { "href": "...", "leafId": "l-..." } }`；
  其它形态一律按失败降级。`target=` 请求尤其必须回 `leafId`（否则点击无法进行）。
- 必须支持 CORS（DS 域 iframe 跨域请求，带凭证）。
- 解析不到时返回 400（未知叶子、路径越界、目标已删除），票据过期返回 401；
  编辑器不弹错误框：悬停显示「无法解析目标路径」，点击只告警。
- 目标文件改名/移动后无需改 PDF：下次悬停重新解析就是新路径（会话内已缓存旧值的除外）。

### 6.6 Link settings 回显与保存（复用 `resolveUrl`）

PDF 编辑模式下右键已有文件外链 →「编辑链接」，对话框复用同一套解析（不新增接口）：

- 打开时按原值优先级 `props.get_Value()` → 原始 `/A` 的 `/F` → `ToolTip` 取目标。
  命中叶子 ID 时自动切到 External Link 页签，输入框**先显示叶子 ID**，同时异步
  调用 `resolveUrl`（`leafId=`）；成功后若用户没改过输入框，原地换成发布相对路径。
  失败/超时静默保留叶子 ID，不弹错、不禁用「确定」，3 秒内可继续操作。
- 已是相对路径（`./`、`../`、`@<序号>/`，或反斜杠旧路径）→ 直接显示，不解析。
- **未改动**直接点「确定」：不重建链接动作，保存后 `/F` 仍是原叶子 ID，`/D`
  （页码与缩放类型、null 参数）与编辑前一致，不会把 `/XYZ null null null` 读成 0。
- **手工改**成别的文件：走原有保存逻辑，`/F` 写成选择器给的相对路径，
  `/GoToR` / `/Launch` 分流不变。
- 本会话新建的链接（`/F` 还是相对显示路径）→ 再次打开时与之前行为一致，
  显示选择器给的路径，不受影响。

---

## 7. 外链点击与宿主阅读器（`openUrl`，可选）

### 7.1 行为

配置 `openUrl` 后，eCTD 会话里的**文件外链**点击不再 `window.open(/F 原值)`，
而是打开宿主自己的阅读器 `<openUrl>?leaf=<目标叶子 ID>`，与宿主 pdf.js 的行为一致。

| 点击的链接（eCTD 会话） | 行为 |
|---|---|
| `/F` 已是叶子 ID（已保存文档） | 同步打开 `<openUrl>?leaf=<leafId>`，**不发解析请求** |
| `/F` 是相对显示路径（本会话新链接） | 先 `resolveUrl` 换到 `leafId`，再打开 `<openUrl>?leaf=<leafId>` |
| 普通 `http(s)` / `mailto` 等绝对地址 | **完全不变**：原安全提示 + 直接打开原地址 |
| 非 eCTD 会话（没有 `customization.ectd`） | **完全不变**：原行为 |
| eCTD 会话但没配 `openUrl` | **完全不变**：原行为（不打开宿主阅读器） |

不在本功能范围内：保存时 `/F` 的写法（仍是叶子 ID）、`/URI` 链接、`ppaction`
链接、Word/表格/演示编辑器。宿主阅读器地址只由宿主配置决定，**编辑器绝不会把
`/F` 原值当作 URL 打开**，避免把内部显示路径（`./@0001/...`）暴露成 404 页面。

### 7.2 配置示例

```js
customization: {
    ectd: {
        openUrl:    'https://host.example.com/pdf/web/viewer.html',        // 阅读器页面（绝对地址，不带 #）
        resolveUrl: 'https://host.example.com/api/ectd-link/href?token=<JWT>' // 仓库内新链接需要
    }
}
```

- `openUrl` 是**页面地址**，不是文档地址：编辑器只负责拼 `?leaf=`（已有查询串时用 `&`）。
  阅读器页面自己根据 `leaf` 参数取文件、鉴权、渲染。
- `openUrl` 可以带查询串（如 `?theme=light`），**不要带 `#fragment`**。
- 只有 `resolveUrl` 而没有 `openUrl` 时，点击行为与之前完全一样（悬停提示仍生效）。

### 7.3 点击流程

**已保存的链接**（`/F` = `l-<uuid>`）：

```
用户 Ctrl+点击 → 编辑器读 /F → window.open('<openUrl>?leaf=' + encodeURIComponent(leafId))
```

同步执行，不发网络请求，不显示安全提示。

**本会话新建、尚未保存的链接**（`/F` = `./@0001/...`）：

```
用户 Ctrl+点击
  ├─ 悬停已解析过 → 直接同步打开 <openUrl>?leaf=<缓存的 leafId>
  └─ 未解析 → 同步预留一个空白标签页（window.open('', '_blank')，防弹窗拦截）
               → GET {resolveUrl}&target=<原值>
               → 成功：把预留标签页导航到 <openUrl>?leaf=<leafId>
               → 失败：关闭预留标签页，仅 console.warn('[eCTD] resolve failed: ...')
```

- 失败（400/401/超时/网络错误）**不会**打开 `/F` 原值，也不会打开错误页；
  用户只会在控制台看到一条告警，页面无弹窗。
- 未配 `resolveUrl` 时点击这类链接：`console.warn('[eCTD] no resolveUrl, link ignored: ...')`，
  不打开任何页面。
- 成功/失败都只影响点击，不修改 PDF、不触发保存。

### 7.4 `resolveUrl` 的点击契约

与第 6 节是同一个接口，点击路径额外要求：

| 请求 | 成功响应 | 失败 |
|---|---|---|
| `GET {resolveUrl}&leafId=l-...` | `200 {"code":0,"data":{"href":"...","leafId":"l-..."}}` | `400` / `401` / 超时 |
| `GET {resolveUrl}&target=<encodeURIComponent(/F 原值)>` | 同上，**`leafId` 必填** | `400` 解析不到（外链、路径越界、目标已删除）；`401` 票据过期 |

- `target` 支持：`./...`、`../...`、`@<序列号>/...`、`/@<序列号>/...`；
  编辑器会原样 URL 编码，宿主按解码后的原始 `/F` 解析。
- `200` 但缺 `leafId`（`target` 请求）按失败处理。
- 3 秒超时；失败做 30 秒负缓存，期间重复点击不重试。
- 请求在编辑器 iframe 内发出（`credentials: 'include'`），CORS 要求同第 6 节。

### 7.5 标签页与弹窗拦截

- 叶子 ID、缓存命中的路径：`window.open` 在点击事件里同步执行，浏览器视为用户手势，
  不会被拦截。
- 需要异步解析的路径：编辑器**先同步预留空白标签页**（`opener` 置空），解析成功后在
  该标签页里导航，因此不会出现“解析完成后新开标签被拦截”的情况；
  解析失败会关闭这个空白页。
- 一次点击只产生一个标签页；不会先开 `/F` 原值再开宿主阅读器。

### 7.6 宿主阅读器要求

- 能接收 `?leaf=<叶子 ID>`（可能接着宿主自己的查询参数），并据此加载文档；
- 建议与宿主 pdf.js 使用同一个阅读器页面，保证书签、缩放、批注等体验一致；
- 阅读器自己处理鉴权；`leaf` 参数不可信，必须按宿主权限校验；
- 宿主若对 `openUrl` 做 CSP，允许被 `window.open` 打开即可（顶层导航，不涉及 iframe 嵌入）。

---

## 8. 安全清单

编辑器侧已做：

- 只接受来自选择器 iframe 且 origin 精确匹配的消息；
- 所有回复固定 `targetOrigin = pickerOrigin`；
- 链接目标白名单校验（见 3.5），拒绝伪协议、控制字符、超长、反斜杠；
- `path` 模式只用相对路径算法生成链接，不直接写入任意字符串；
- `dest` 只接受规定的类型名、非负整数页码和有限数字，只允许用于相对 `.pdf` 目标；
- `resolveUrl` 不写控制台，不落盘；
- eCTD 会话点击文件外链时，只打开宿主配置的 `<openUrl>?leaf=...`，
  **绝不把 `/F` 原值当 URL 打开**；解析失败只告警，不打开任何页面。

宿主侧应做：

- 处理 `ectd:init` / `ectd:invalid` 前校验 `event.source === window.parent`（可选加固）；
- 回复前确保 `editorOrigin` 已从 init 中获得；
- 不要把用户输入原样当 `href` 回传，先做自己的校验/编码；
- 生产环境避免在 URL 中放长期令牌，使用短期签名或一次性票据；
- CORS 白名单收紧到 DS 域，不要回显任意 Origin；接口日志对 `token` 脱敏；
- 选择器页面自身也建议加 CSP，纵深防御；
- `openUrl` 指向的阅读器必须把 `leaf` 当作不可信输入：按当前用户权限重新鉴权、
  校验路径归属，不要仅凭 `leaf` 直接读任意文件或跳转。

---

## 9. 本地 demo 与联调

```bash
cd DocumentServer/web-client
node serve.js                 # 宿主 demo，8081 端口
# 浏览器打开 http://localhost:8081/
```

`js/config.js` 里切换模式（demo 的 `editor.html` 会把这里的相对地址转成绝对地址再下发；
生产环境请直接使用绝对地址）：

```js
ectd: {
    enabled: true,                              // demo 侧开关：false 时不下发 customization.ectd
    pickerUrl: '',                              // 默认内置树模式；改成 '/ectd-picker.html' 切到宿主 UI 插槽
    treeUrl: '/api/ectd/files/tree',
    resolveUrl: '/api/ectd/link/href?token=demo-token',
    openUrl: '/host-viewer.html'                // 点击外链时打开的宿主阅读器占位页
}
```

- `ectd-picker.html`：完整宿主选择器参考实现（读取 `ectd-tree.json`、渲染 m1–m5、
  筛选、选择后计算相对路径并 postMessage 回传）。
- `ectd-tree.json`：内置树的演示数据源（改完保存，下次打开对话框即生效）。
- `host-viewer.html`：宿主阅读器占位页，只显示收到的 `?leaf=` 参数；生产环境换成
  宿主自己的阅读器（应与 pdf.js 使用同一页面）。
- `docs/link-tooltip-demo.pdf`：外链演示文档，页面里有 4 个链接：
  - 第 1 个：`/GoToR`，`/F` 是叶子 ID；
  - 第 2 个：`/Launch`，`/F` 是叶子 ID；
  - 第 3 个：`/URI`，`https://example.com/x`（普通外链，行为不变）；
  - 第 4 个：`/GoToR`，`/F` 是显示路径 `./@0001/1.2 封面信/3.pdf`（悬停/点击走 `target=`）。
- `serve.js` 的 mock 接口：
  - `GET /api/ectd/files/tree`：目录树；
  - `GET /api/ectd/link/href?token=...&leafId=...`：叶子 ID → `{href, leafId}`
    （数据见 `MOCK_LINKS`）；
  - `GET /api/ectd/link/href?token=...&target=...`：显示路径 → `{href, leafId}`
    （数据见 `MOCK_TARGETS`）；
  - `POST /callback`、`GET /api/history/*`：保存回调与版本历史（与本手册无关，见 README）。

联调点击：在编辑器里按住 Ctrl 点击演示文档的链接，应打开
`http://localhost:8081/host-viewer.html?leaf=...`；第 4 个链接会先发一次
`target=` 解析请求。把 `resolveUrl` 改成 `...&fail=400` 可验证失败时只告警、
不打开 `/F` 原值。

联调降级时可给 `resolveUrl` 加 mock 参数：`fail=401|500|400`（直接返回错误）、
`delay=<毫秒>`（延迟响应，用来验证 3 秒超时与 30 秒负缓存）。例如把 `config.js` 改成
`/api/ectd/link/href?token=demo-token&delay=5000`。

---

## 10. 排障

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 看不到「选择文件」按钮 | `customization.ectd` 没传到编辑器；`pickerUrl` 协议不是 http(s)；两种模式都没配；树模式缺 `currentDocumentPath` | 在编辑器控制台看 `PDFE.getController('Main').editorConfig.customization.ectd`；确认宿主页面把相对地址转成了绝对地址 |
| 弹窗空白 / 拒绝连接 | 宿主页面禁止被 iframe 嵌入（`X-Frame-Options`、`frame-ancestors`）；HTTPS 混合内容；地址 404 | 看浏览器控制台的 Refused to frame 报错；用 `curl -I` 看响应头；确认 DS 与宿主协议一致 |
| 页面能开，点确认没反应 | 没收到 init（`editorOrigin` 为空）；postMessage 的 targetOrigin 不是 init 的 `event.origin`；选择器页面跳转过 origin 但没配 `pickerOrigin` | 打印收到的消息；检查 `window.parent.postMessage(..., editorOrigin)`；跳转场景显式配置 `pickerOrigin` |
| 输入框没回填 | 回传的 `href` 被白名单拒绝；只回 `path` 但没配 `currentDocumentPath`；`path` 为空 | 监听 `ectd:invalid` 的 `reason`；相对链接确认以 `./` 或 `../` 开头 |
| 回填的路径不符合预期 | 宿主把绝对路径当 `href` 传了；相对路径基准不是当前 PDF | 推荐回 `path` 让编辑器算；或按 5.2 的算法以当前 PDF 目录为基准 |
| 内置树一直加载失败 | `treeUrl` 不是绝对地址；CORS 没放行 DS 域；响应不是 `{code:0,data:[...]}` | 在编辑器 iframe 的 Network 里看请求；`curl -H 'Origin: <DS域>'` 验证 CORS 头 |
| 带 `dest` 被拒绝 | `dest` 用在绝对地址或非 PDF 目标；`page` 不是非负整数；`FitR` 缺角 | 只能用于相对 `.pdf` 链接；按 4.3 校验字段 |
| 悬停只显示叶子 ID，没有解析结果 | `resolveUrl` 未配置；`/F` 不是叶子 ID/相对显示路径形态；接口 401/500/CORS 失败；超过 3 秒；处于 30 秒负缓存 | 看 Network 是否发出 `leafId=` 或 `target=` 请求；检查配置与接口响应 `{code:0,data:{href,leafId}}`；确认 CORS 回显 Origin |
| 悬停提示一直停在原始 ID | 解析接口响应慢或超时（3 秒） | 首次悬停先显示原始 ID，结果回来才原地替换；优化接口或检查超时 |
| 点击外链没反应 | 没有配 `openUrl`；链接不是 `/GoToR`/`/Launch`；没有按住 Ctrl；非 eCTD 会话 | 看 `editorConfig.customization.ectd.openUrl`；确认按 Ctrl 点击；查看控制台 `[eCTD]` 告警 |
| 点击打开了 `/F` 原值或 404 页面 | `openUrl` 未配置，或 `/F` 不匹配叶子 ID/相对显示路径而落回原安全提示 | 同一行：eCTD 会话务必配 `openUrl`；相对路径链接需要 `resolveUrl` 能把它解析成 `leafId` |
| 点击新链接后标签页一闪而过 | `resolveUrl` 返回 400/401、超时或缺少 `leafId`，编辑器关闭了预留的空白标签页 | 看控制台 `[eCTD] resolve failed`；检查 `target=` 响应是否含 `leafId` |
| 点击后打开两/多个标签页 | 宿主配置的 `openUrl` 自己又打开了文档页；或旧版本编辑器（会先开原始链接） | 阅读器页面只负责渲染，不要再 `window.open` 文档；确认镜像包含本次定制（7.5） |
| 带查询串的 `openUrl` 参数丢失 | `openUrl` 里用了 `#fragment`，`leaf` 被拼到 fragment 后面 | 去掉 fragment，改用查询串传递阅读器参数 |
| 重新打开文档，链接对话框里看不到 URL | wasm 阅读层不解析 `/GoToR` `/Launch`（已知限制，见 4.4） | 链接没有丢；保存会保留 `/A`，悬停仍显示目标（第 6 节），点击走宿主阅读器（第 7 节） |
| 鉴权 401 / 跳登录页 | 顶层是 DS 域时 cookie 不是同站；浏览器隐私策略 | 用短期 URL 令牌，或 `SameSite=None; Secure` |
| 改了选择器页面但浏览器还是旧版 | 宿主静态资源缓存 | 宿主侧加版本参数/清缓存；DS 自身的编辑器缓存由服务端 cache tag 轮换处理 |
| 自动化里 `new PDFE.Views.HyperlinkSettingsDialog` 报 "is not a constructor" | 编辑器视图随 `code.js` 在**文档内容就绪后**才加载 | 等 `Main._isDocReady && LaunchController.isScriptLoaded()` 后再操作 |

---

## 11. 版本与兼容

- 本手册描述的是**本仓库定制**的 `customization.ectd` 扩展 + postMessage 契约；
  升级 DocumentServer 后需重新回归第 3–7 节。
- 宿主 UI 模式与内置树模式可同时配置，`pickerUrl` 优先；删除 `pickerUrl` 即回退内置树。
- 尺寸越界不会报错，按默认值处理（宽 720、高 520）。
- `dest` 是向后兼容的可选扩展：旧宿主不传时行为与之前完全一致（PDF 默认第 1 页、承前缩放）。
- `resolveUrl` 是向后兼容的可选扩展：旧宿主不配时提示显示原始 `/F`，不发任何请求。
- `openUrl` 是向后兼容的可选扩展：旧宿主不配时点击行为与之前完全一致（原安全提示/
  原始链接），不会打开宿主阅读器。
- 编辑器只负责「选文件 → 回填链接」和「点击 → 打开宿主阅读器」，不会替宿主保存文档、
  上传文件，也不读取目标文件内容。

---

## 12. 相关文件

| 文件 | 作用 |
|---|---|
| `web-apps/apps/pdfeditor/main/app/view/HyperlinkSettingsDialog.js` | 编辑器侧实现：`ECtDApi.getPicker()`、`ECtDHostPickerDialog`（随 code.js 打包） |
| `web-apps/apps/pdfeditor/main/app/controller/DocumentHolderExt.js` | 外链悬停提示与点击桥接（`resolveUrl` 解析、缓存、超时降级；恢复 wasm 层丢弃的 `/GoToR` `/Launch` 点击） |
| `web-apps/apps/pdfeditor/main/app/controller/Main.js` | `onOpenLinkPdfForm`：按 `openUrl` 打开宿主阅读器（`?leaf=`），普通外链保持原安全提示 |
| `web-client/host-viewer.html` | 宿主阅读器占位页（demo 只显示 `?leaf=` 参数） |
| `web-client/ectd-picker.html` | 宿主选择器参考实现（iframe 页面） |
| `web-client/ectd-tree.json` | demo 数据源（宿主可换成自己的接口） |
| `web-client/js/config.js` | `ectd.pickerUrl` / `treeUrl` / `resolveUrl` / `openUrl` 配置入口 |
| `web-client/js/ectd-service.js` | 相对路径算法参考实现 |
| `web-client/editor.html` | 把 `customization.ectd` 下发给编辑器的示例 |
| `web-client/serve.js` | 本地 mock：目录树接口 + 外链解析接口 `/api/ectd/link/href`（`leafId=`/`target=`） |
| `web-client/docs/link-tooltip-demo.pdf` | 外链演示文档（GoToR / Launch / URI / 显示路径 GoToR） |
| `README.md` 第五节 | eCTD 接口契约摘要 |
