/*
 * web-client demo — JWT 前端临时签发（⚠ 仅限本地联调，生产禁用）
 * ============================================================================
 * DocumentServer 开启 JWT 后，config.token = HS256(整个 config, DS 的 secret)。
 *
 * 生产环境的正确做法（本文件不承担）：
 *   前端把要打开的文档信息发给【宿主后端】→ 后端用与 DS 共享的 secret 签发
 *   token → 前端拿到 token 塞进 config。secret 绝不能出现在浏览器代码里。
 *
 * 本文件仅为本地 demo 提供等价能力（secret 从配置面板输入），
 * 依赖 WebCrypto（https 或 localhost 环境可用）。
 */
window.WebClient = window.WebClient || {};

WebClient.jwt = {
    sign: function (payload, secret) {
        function b64url(buf) {
            var bytes = new Uint8Array(buf), s = '';
            for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
            return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        var enc = new TextEncoder();
        var p1 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
        var p2 = b64url(enc.encode(JSON.stringify(payload)));
        return crypto.subtle
            .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
            .then(function (key) { return crypto.subtle.sign('HMAC', key, enc.encode(p1 + '.' + p2)); })
            .then(function (sig) { return p1 + '.' + p2 + '.' + b64url(sig); });
    }
};
