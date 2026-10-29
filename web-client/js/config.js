/*
 * web-client demo — 全局配置
 * ============================================================================
 * 拷贝到宿主应用时要改的就是本文件（以及 docs.js、ectd-service.js 的数据来源）。
 * 页面里可以在「配置」面板中临时覆盖，覆盖值保存在 localStorage（key: web-client-config-v2）。
 */
window.WebClient = window.WebClient || {};

WebClient.config = {
    // DocumentServer 地址（nginx 入口，浏览器直连）。
    dsBaseUrl: 'http://localhost',
    apiPath:   '/web-apps/apps/api/documents/api.js',

    // JWT（DocumentServer 当前为关闭状态，留空即可运行）。
    // 生产环境：token 必须由宿主【后端】用 DS 的 secret 签发后传给前端，
    // secret 绝不能进浏览器。这里填值 = 用 jwt-dev.js 在前端临时签发，
    // 仅用于本地联调（Secret 见 DS 配置 services.CoAuthoring.secret.*）。
    jwtSecret: '',

    // 保存回调：宿主后端接口地址，DocumentServer 服务器要能访问它。
    // ⚠ 不是可选项：DS 对没有 callbackUrl 的文档会【直接拒绝保存】
    //    （force save 返回 NotModified，编辑器表现为点保存没反应/稍后报错）。
    // 本地 demo 默认指向 serve.js 的回调端点（模拟宿主后端，落盘到 docs/）；
    // 172.17.0.1 = docker 容器看到的宿主机地址。生产换成宿主后端地址，
    // 协议见 README「保存回调契约」。
    callbackUrl: 'http://172.17.0.1:8081/callback',

    // eCTD 宿主接口（编辑器已接线，契约详见 README 第五节）：
    // 两种模式二选一，pickerUrl 优先：
    //   1. 宿主 UI 模式：pickerUrl = 宿主自己的选择器页面（编辑器用 iframe 嵌入，
    //      数据源、UI、鉴权全归宿主；postMessage 契约见 ectd-picker.html）；
    //   2. 内置树模式：treeUrl = 编辑器实时 GET 的目录树接口（UI 由编辑器渲染），
    //      本地由 serve.js 提供，数据在 ectd-tree.json。
    ectd: {
        enabled: true,
        // 宿主 UI 模式：留空 = 用内置树模式。demo 页面见 ectd-picker.html。
        pickerUrl: '',
        // 可选：iframe 尺寸（默认 720x520）、以及消息 origin 白名单（默认取 pickerUrl 的 origin）
        // pickerWidth: 720,
        // pickerHeight: 520,
        // pickerOrigin: 'http://localhost:8081',
        // 内置树模式：GET {treeUrl} => { "code": 0, "data": [ {name, children?}, ... ] }
        treeUrl: '/api/ectd/files/tree',
        // 外链悬浮提示解析接口（可选）：GET {resolveUrl}&leafId=<叶子ID>
        //   => { "code": 0, "data": { "href": "../../1.2 封面信/xxx.pdf", "leafId": "l-..." } }
        // PDF 里 /GoToR、/Launch 的 /F 存的是 eCTD 叶子 ID 时，编辑器悬停用它
        // 换出发布相对路径；未归一化的选择器路径（./@0001/...）用 &target=<原值>。
        // 不配则提示显示原始值。本地由 serve.js 模拟，生产换成宿主后端地址
        // （同样要开 CORS）。详见 README 第五节。
        resolveUrl: '/api/ectd/link/href?token=demo-token',
        // 宿主阅读器（可选）：eCTD 会话里点击 /GoToR、/Launch 时打开
        //   {openUrl}?leaf=<叶子ID>
        // 不再 window.open 原始 /F；不配则保持原有安全提示 + 打开原值。
        // 本地占位页见 host-viewer.html，生产换成宿主自己的阅读器。
        openUrl: '/host-viewer.html'
    }
};

// 页面级覆盖（配置面板写入 localStorage）
try {
    var saved = JSON.parse(localStorage.getItem('web-client-config-v2') || '{}');
    for (var k in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, k))
            WebClient.config[k] = saved[k];
    }
} catch (e) { /* 忽略损坏的本地配置 */ }

WebClient.saveConfig = function (patch) {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('web-client-config-v2') || '{}'); } catch (e) {}
    for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
            WebClient.config[k] = patch[k];
            saved[k] = patch[k];
        }
    }
    localStorage.setItem('web-client-config-v2', JSON.stringify(saved));
};
