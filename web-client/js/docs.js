/*
 * web-client demo — 文档清单（宿主侧数据）
 * ============================================================================
 * 【拷贝点】宿主应用里这份清单来自你自己的后端（数据库/对象存储的文档列表），
 * 页面结构无关。每个文档需要：
 *
 *   id           唯一标识（demo 直接用于 key 前缀，生产按"文档版本"生成 key）
 *   title        编辑器标题栏显示名
 *   documentType 编辑器类型：'pdf' | 'word' | 'cell' | 'slide'
 *   fileType     文件扩展名（不带点）
 *   file         docs/ 下的文件名（演示用；生产不需要，直接给 url）
 *   url          ★ 文档地址：DocumentServer 的【服务器】必须能拉取到它
 *                （演示中由 docBase + file 拼出；生产：宿主后端的下载接口，
 *                带签名/短期凭证更佳）
 *   ectdPath     该文档在 eCTD 结构中的路径 "m1 .../xx/yy.pdf"
 *                （生产：由宿主后端维护的映射，前端拿到的就是这个值）
 *
 * 本 demo 的演示文件放在同目录的 docs/ 下，由 serve.js 一并提供。
 *
 * ⚠ 地址是给【DocumentServer 服务器】用的：本地联调时 DS 跑在 docker 容器里，
 *   容器经 docker 网关（172.17.0.1）访问宿主机的 8081 端口 → 即下面的 docBase。
 *   生产环境直接换成宿主后端的下载接口地址（浏览器无感知）。
 */
window.WebClient = window.WebClient || {};

// 演示文档的基地址（★ 本地联调专用，拷进宿主应用时整段替换）
WebClient.docBase = 'http://172.17.0.1:8081/docs/';

WebClient.docs = [
    {
        // 外链演示：页面里有 /GoToR、/Launch（/F 是 eCTD 叶子 ID）、/URI
        // 和 /GoToR（/F 是显示路径）四个链接；悬停可看到 resolveUrl 解析结果，
        // 点击打开 openUrl 宿主阅读器（见 README 第五节 5、6 小节）。
        id:           'link-tooltip-demo',
        title:        '外链悬浮提示示例.pdf',
        documentType: 'pdf',
        fileType:     'pdf',
        file:         'link-tooltip-demo.pdf',
        ectdPath:     'm1 区域行政信息/1.2-封面信/link-tooltip-demo.pdf'
    },
    {
        // E2E 用：由 2026-10-27 修复前镜像保存出的产物（链接带 /AP 且 /BS /W 1）。
        // 用于「编辑已有 GoToR/Launch 超链接后保存不生效」的回归测试
        // （web-client/e2e/e2e_edit_link_persist.py）。
        id:           'link-persist-demo',
        title:        '编辑链接持久化示例.pdf',
        documentType: 'pdf',
        fileType:     'pdf',
        file:         'link-persist-demo.pdf',
        ectdPath:     'm1 区域行政信息/1.2-封面信/link-persist-demo.pdf'
    },
    {
        id:           'who-ectd',
        title:        'WHO eCTD Guidance for Industry v1.0.pdf',
        documentType: 'pdf',
        fileType:     'pdf',
        file:         'WHO eCTD Guidance for Industry v1.0.pdf',
        ectdPath:     'm1 区域行政信息/1.2-封面信/WHO eCTD Guidance for Industry v1.0.pdf'
    },
    {
        id:           'sample-pdf',
        title:        'sample.pdf',
        documentType: 'pdf',
        fileType:     'pdf',
        file:         'sample.pdf',
        // 演示映射：这份文件对应 eCTD 的哪个节点（真实系统由后端维护）
        ectdPath:     'm3 质量/3.2.P-制剂/3.2.P.7-包装材料.pdf'
    },
    {
        id:           'sample-docx',
        title:        'sample.docx',
        documentType: 'word',
        fileType:     'docx',
        file:         'sample.docx',
        ectdPath:     'm1 区域行政信息/1.3-产品信息/1.3.2-标签.docx'
    }
];

// 演示用：文档 url = docBase + 文件名（给 DS 服务器拉取；生产由后端直接给出 url）
WebClient.docs.forEach(function (d) {
    d.url = WebClient.docBase + encodeURIComponent(d.file);
});
