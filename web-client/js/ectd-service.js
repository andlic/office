/*
 * web-client demo — eCTD 宿主接口（★ 核心拷贝点）
 * ============================================================================
 * 链接对话框的目录树数据归属【宿主应用】，编辑器已接线直接消费：
 *
 *   GET {treeUrl}   （编辑器实时 fetch，见 customization.ectd.treeUrl）
 *     => { "code": 0, "data": [ { "name": "m1 区域行政信息",
 *                                 "children": [ { "name": "1.0-封面",
 *                                                 "children": [ { "name": "cover.pdf" } ] } ] } ] }
 *     文件夹 = 有 children 的节点；文件 = 只有 name 的叶子。
 *     本地 demo 的实现在 serve.js + ectd-tree.json（改 JSON 即换树）。
 *
 * 当前文档路径（currentDocumentPath）由宿主打开编辑器时内联传入配置
 * （见 editor.html），无需接口。
 *
 * 本文件剩下的三个方法服务于 index 页的「宿主接口自测」面板：
 *
 *   fetchTree()                -> 目录树（mock；生产 = fetch 宿主后端）
 *   getCurrentDocumentPath(doc) -> 当前文档在 eCTD 结构中的路径（演示：取 doc.ectdPath）
 *   getRelativePath(from, to)  -> 相对路径算法（纯函数，建议原样拷贝）
 *
 * 鉴权走宿主自己的会话/令牌体系（编辑器侧请求带 credentials:'include'，
 * 宿主接口需开 CORS，见 README 第五节）。
 */
window.WebClient = window.WebClient || {};

WebClient.ectd = {

    /**
     * 目录树。生产实现（替换内部即可，返回值形状不变）：
     *   const r = await fetch(cfg.ectd.treeUrl, { credentials: 'include' });
     *   const j = await r.json();
     *   if (j.code !== 0) throw new Error('eCTD tree error');
     *   return j.data;
     */
    fetchTree: function () {
        return new Promise(function (resolve) {
            // 模拟网络延迟 + 深拷贝（防止调用方意外改动 mock 数据）
            setTimeout(function () {
                resolve(JSON.parse(JSON.stringify(WebClient.ectd._tree)));
            }, 150);
        });
    },

    /**
     * 当前文档在 eCTD 结构中的路径。
     * 生产实现：GET {currentDocumentUrl}?fileId=doc.id → j.data.path
     * （或由宿主在打开编辑器时直接下发，见 README「eCTD 接口契约」的两种传递方式）
     */
    getCurrentDocumentPath: function (doc) {
        return doc && doc.ectdPath ? doc.ectdPath : '';
    },

    /**
     * 计算 toPath 相对 fromPath 的相对路径（两边均为 "a/b/c.pdf" 形式）。
     * 结果以 "./" 或 "../" 开头 —— 作为链接目标无歧义。
     * 纯函数、无宿主依赖，接入时原样拷贝。
     */
    getRelativePath: function (fromPath, toPath) {
        var from = fromPath.split('/'); from.pop();          // 当前文件所在目录
        var to   = toPath.split('/');
        var i = 0;
        while (i < from.length && i < to.length - 1 && from[i] === to[i]) ++i;
        var parts = [];
        for (var u = i; u < from.length; ++u) parts.push('..');
        parts = parts.concat(to.slice(i));
        var rel = parts.join('/');
        return rel.indexOf('../') === 0 ? rel : './' + rel;
    },

    // =========================================================================
    //  MOCK 数据 —— 与编辑器内 ECtDApiMock 一字不差；接入真实后端后整段可删
    // =========================================================================
    _tree: [
        { name: 'm1 区域行政信息11111', children: [
            { name: '1.0-封面', children: [
                { name: 'cover.pdf' }, { name: 'cover.xml' } ]},
            { name: '1.1-行政表格', children: [
                { name: '1.1.1-eCTD表格.pdf' }, { name: '1.1.2-申请表.pdf' } ]},
            { name: '1.2-封面信', children: [
                { name: 'WHO eCTD Guidance for Industry v1.0.pdf' },
                { name: 'cover-letter.pdf' } ]},
            { name: '1.3-产品信息', children: [
                { name: '1.3.1-产品说明书.pdf' }, { name: '1.3.2-标签.docx' } ]},
            { name: '1.4-专家信息', children: [
                { name: '1.4.1-专家简历.pdf' }, { name: '1.4.2-CV附件.pdf' } ]}
        ]},
        { name: 'm2 CTD摘要', children: [
            { name: '2.2-引言', children: [
                { name: '2.2-introduction.pdf' } ]},
            { name: '2.3-质量总体概述', children: [
                { name: '2.3-quality-overall-summary.pdf' }, { name: '2.3-quality-overall-summary.xml' } ]},
            { name: '2.4-非临床概述', children: [
                { name: '2.4-nonclinical-overview.pdf' } ]},
            { name: '2.5-临床概述', children: [
                { name: '2.5-clinical-overview.pdf' } ]}
        ]},
        { name: 'm3 质量', children: [
            { name: '3.2.S-原料药', children: [
                { name: '3.2.S.1-基本信息', children: [
                    { name: '3.2.S.1.1-命名.pdf' }, { name: '3.2.S.1.2-结构.pdf' } ]},
                { name: '3.2.S.2-生产', children: [
                    { name: '3.2.S.2.1-生产商.pdf' }, { name: '3.2.S.2.2-工艺描述.pdf' } ]},
                { name: '3.2.S.3-特性鉴定', children: [
                    { name: '3.2.S.3.1-结构确证.pdf' } ]},
                { name: '3.2.S.4-质量控制', children: [
                    { name: '3.2.S.4.1-质量标准.pdf' }, { name: '3.2.S.4.2-分析方法.pdf' } ]},
                { name: '3.2.S.7-稳定性', children: [
                    { name: '3.2.S.7.1-稳定性总结.pdf' } ]}
            ]},
            { name: '3.2.P-制剂', children: [
                { name: '3.2.P.1-剂型组成.pdf' },
                { name: '3.2.P.2-处方开发.pdf' },
                { name: '3.2.P.3-生产.pdf' },
                { name: '3.2.P.4-辅料控制.pdf' },
                { name: '3.2.P.5-制剂质量控制.pdf' },
                { name: '3.2.P.6-对照品.pdf' },
                { name: '3.2.P.7-包装材料.pdf' },
                { name: '3.2.P.8-稳定性.pdf' }
            ]},
            { name: '3.2.A-附录', children: [
                { name: '3.2.A.1-设施设备.pdf' }, { name: '3.2.A.2-环境评估.pdf' } ]},
            { name: '3.2.R-区域信息', children: [
                { name: '3.2.R.1-工艺验证.pdf' } ]},
            { name: '3.3-参考文献', children: [
                { name: '3.3-references.pdf' } ]}
        ]},
        { name: 'm4 非临床研究报告', children: [
            { name: '4.2-药理学', children: [
                { name: '4.2.1-药效学.pdf' }, { name: '4.2.2-药代动力学.pdf' }, { name: '4.2.3-安全性药理学.pdf' } ]},
            { name: '4.3-药代动力学', children: [
                { name: '4.3.1-分析方法.pdf' }, { name: '4.3.2-吸收.pdf' }, { name: '4.3.3-分布.pdf' },
                { name: '4.3.4-代谢.pdf' }, { name: '4.3.5-排泄.pdf' } ]},
            { name: '4.4-毒理学', children: [
                { name: '4.4.1-单次给药毒性.pdf' }, { name: '4.4.2-重复给药毒性.pdf' },
                { name: '4.4.3-遗传毒性.pdf' }, { name: '4.4.5-致癌性.pdf' } ]}
        ]},
        { name: 'm5 临床研究报告', children: [
            { name: '5.2-临床药理学', children: [
                { name: '5.2.1-药效学.pdf' }, { name: '5.2.2-药代动力学.pdf' } ]},
            { name: '5.3-临床药代动力学', children: [
                { name: '5.3.1-健康受试者研究.pdf' }, { name: '5.3.2-患者药代动力学.pdf' },
                { name: '5.3.3-内在因素.pdf' }, { name: '5.3.4-外在因素.pdf' },
                { name: '5.3.5-重点研究', children: [
                    { name: '5.3.5.1-研究001.pdf' }, { name: '5.3.5.2-研究002.pdf' } ]}
            ]},
            { name: '5.4-参考文献', children: [
                { name: '5.4-references.pdf' } ]}
        ]}
    ]
};
