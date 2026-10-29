# Dockerfile.custom — 自定义 ONLYOFFICE DocumentServer 镜像
#
# 构建上下文 = build_tools/.docker-ctx/（docker_build.sh 准备；只含 Dockerfile + 几个 tar.gz，
# 避免把 12GB 项目根发给 docker daemon）。大目录先打 tar、COPY 后 RUN 解压。
# 顺序关键：server → core-bin/core-lib → sdkjs/web-apps → dict/schema/fonts/templates

FROM onlyoffice/documentserver:9.4.0

ARG DS_DOC_ROOT=/var/www/onlyoffice/documentserver
ARG NODE_VERSION=20.18.0

# JWT secret：上游默认每次启动随机生成（重启后 example 校验失败），改成稳定值。
# 覆盖优先级：运行时 -e JWT_SECRET > 构建 --build-arg > 默认 mysecret123
ARG JWT_SECRET=mysecret123
ENV JWT_SECRET=${JWT_SECRET}

# JWT 关闭（本地 dev 用）。如果要强制开启：-e JWT_ENABLED=true -e JWT_SECRET=xxx
ENV JWT_ENABLED=false

# 启用 example 服务（run-document-server.sh 看到 EXAMPLE_ENABLED=true 才会
# 把 ds-example.conf 的 autostart 改成 true，否则 example 服务永远 STOPPED）
ENV EXAMPLE_ENABLED=true

# 0. 装 Node.js（官方镜像没有 node，因为 converter/docservice 用的是 pkg 自包含二进制）
#    我们的版本是用 node 跑 sources/*.js，所以需要 node。
RUN set -eux; \
    cd /tmp && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" -o node.tar.gz && \
    tar -xzf node.tar.gz && \
    mv "node-v${NODE_VERSION}-linux-x64" /opt/node && \
    ln -sf /opt/node/bin/node /usr/local/bin/node && \
    ln -sf /opt/node/bin/npm /usr/local/bin/npm && \
    ln -sf /opt/node/bin/npx /usr/local/bin/npx && \
    rm -f node.tar.gz && \
    node --version

# 1. server 整套 node_modules（重置整个 server 目录）
#    注意：server.tar.gz 内含 server/ 前缀，提取时 --strip-components=1
#    基础镜像的 server/ 下有 3 个我们仓库里没有的东西：tools/（pluginsmanager 等）、
#    welcome/、info/（两个静态页，被 production-linux.json 的 /welcome、/info 路由引用）。
#    整目录 rm -rf 会把它们一起删掉，所以先留一份，替换后再放回去。
COPY server.tar.gz /tmp/server.tar.gz
RUN set -eux; \
    mkdir -p /tmp/ds-keep; \
    for d in tools welcome info; do \
      if [ -e "${DS_DOC_ROOT}/server/$d" ]; then cp -a "${DS_DOC_ROOT}/server/$d" /tmp/ds-keep/; fi; \
    done; \
    rm -rf ${DS_DOC_ROOT}/server; \
    mkdir -p ${DS_DOC_ROOT}/server; \
    tar -xzf /tmp/server.tar.gz -C ${DS_DOC_ROOT}/server/ --strip-components=1; \
    for d in tools welcome info; do \
      if [ -e "/tmp/ds-keep/$d" ]; then \
        rm -rf "${DS_DOC_ROOT}/server/$d"; \
        cp -a "/tmp/ds-keep/$d" "${DS_DOC_ROOT}/server/$d"; \
      fi; \
    done; \
    chmod -R u+w ${DS_DOC_ROOT}/server/tools 2>/dev/null || true; \
    rm -rf /tmp/ds-keep /tmp/server.tar.gz

# 1c. 包装 converter/docservice/gc/prepare4shutdown，让 supervisor 用 node 跑源码
#     官方镜像里这些是 pkg 打包的单一二进制（141MB）。我们没装 pkg，所以
#     写一个 bash wrapper：cd 到 sources/ 后 exec node <script>
#     这样 require('./../../Common/...') 相对路径才正确
RUN set -eux; \
    for pair in \
        "${DS_DOC_ROOT}/server/FileConverter:convertermaster.js:converter" \
        "${DS_DOC_ROOT}/server/DocService:server.js:docservice" \
        "${DS_DOC_ROOT}/server/DocService:gc.js:gc" \
        "${DS_DOC_ROOT}/server/DocService:shutdown.js:prepare4shutdown"; do \
      dir=$(echo "$pair" | cut -d: -f1); \
      src=$(echo "$pair" | cut -d: -f2); \
      tgt=$(echo "$pair" | cut -d: -f3); \
      printf '#!/bin/bash\ncd "%s/sources"\nexec /usr/local/bin/node "%s" "$@"\n' "$dir" "$src" > "$dir/$tgt"; \
      chmod 755 "$dir/$tgt"; \
      chown ds:ds "$dir/$tgt" 2>/dev/null || true; \
    done

# 2. core C++ 二进制和库（覆盖 FileConverter/bin）
COPY core-bin.tar.gz /tmp/core-bin.tar.gz
COPY core-lib.tar.gz /tmp/core-lib.tar.gz
RUN rm -rf ${DS_DOC_ROOT}/server/FileConverter/bin && \
    mkdir -p ${DS_DOC_ROOT}/server/FileConverter/bin && \
    tar -xzf /tmp/core-bin.tar.gz -C ${DS_DOC_ROOT}/server/FileConverter/bin/ && \
    tar -xzf /tmp/core-lib.tar.gz -C ${DS_DOC_ROOT}/server/FileConverter/bin/ && \
    rm -f /tmp/core-bin.tar.gz /tmp/core-lib.tar.gz

# 2c. 补字体生成工具的官方路径。容器启动脚本引用 $DS/server/tools/{allfontsgen,allthemesgen}，
#     缺失会导致字体重建静默失败（后果：导出 PDF 中文丢失）
RUN mkdir -p ${DS_DOC_ROOT}/server/tools && \
    ln -sf ../FileConverter/bin/allfontsgen ${DS_DOC_ROOT}/server/tools/allfontsgen && \
    ln -sf ../FileConverter/bin/allthemesgen ${DS_DOC_ROOT}/server/tools/allthemesgen

# 3. sdkjs + web-apps
COPY sdkjs-deploy.tar.gz /tmp/sdkjs-deploy.tar.gz
COPY webapps-deploy.tar.gz /tmp/webapps-deploy.tar.gz
RUN rm -rf ${DS_DOC_ROOT}/sdkjs ${DS_DOC_ROOT}/web-apps && \
    mkdir -p ${DS_DOC_ROOT}/sdkjs ${DS_DOC_ROOT}/web-apps && \
    tar -xzf /tmp/sdkjs-deploy.tar.gz -C ${DS_DOC_ROOT}/sdkjs/ --strip-components=1 && \
    tar -xzf /tmp/webapps-deploy.tar.gz -C ${DS_DOC_ROOT}/web-apps/ --strip-components=1 && \
    # 字体清单兜底（容器启动时会用容器内路径重新生成，那份才是权威）
    cp ${DS_DOC_ROOT}/server/FileConverter/bin/fonts/AllFonts_web.js ${DS_DOC_ROOT}/sdkjs/common/AllFonts.js && \
    # flush-cache 脚本靠它轮换 cache_tag + api.js 版本号（官方包内置，本地构建缺；由 api.js 反推）。
    # 注意版本串是 "9.4.0-<32hex>"（没有 v）；带 v 的正则会匹配不到 → 版本号写死 →
    # 静态资源走 immutable 缓存，浏览器永远拿旧 code.js（2026-10-21 假 eCTD 树的根因）。
    sed -E 's/([0-9]+\.[0-9]+\.[0-9]+-)[0-9a-f]{32}/\1{{HASH_POSTFIX}}/g' \
        ${DS_DOC_ROOT}/web-apps/apps/api/documents/api.js \
        > ${DS_DOC_ROOT}/web-apps/apps/api/documents/api.js.tpl && \
    # 别用 PNG 覆盖 doc-formats/formats@2.5x.svg —— 必须是真 SVG（PNG 会致图标加载抛错）
    rm -f /tmp/sdkjs-deploy.tar.gz /tmp/webapps-deploy.tar.gz

# 4. dictionaries, schemas, fonts, templates（tar 顶层即目录名）
#    dictionaries/schema/templates 沿用原有 strip=1 行为不动；core-fonts 见下方注释
COPY dictionaries.tar.gz /tmp/dictionaries.tar.gz
COPY schema.tar.gz /tmp/schema.tar.gz
COPY core-fonts.tar.gz /tmp/core-fonts.tar.gz
COPY templates.tar.gz /tmp/templates.tar.gz
RUN rm -rf ${DS_DOC_ROOT}/dictionaries ${DS_DOC_ROOT}/fonts && \
    tar -xzf /tmp/dictionaries.tar.gz -C ${DS_DOC_ROOT}/ --strip-components=1 && \
    rm -rf ${DS_DOC_ROOT}/server/schema && \
    mkdir -p ${DS_DOC_ROOT}/server/schema && \
    tar -xzf /tmp/schema.tar.gz -C ${DS_DOC_ROOT}/server/ --strip-components=1 && \
    # 不加 --strip-components：保持顶层 core-fonts/（含并入的 custom/）合并进 $DS/core-fonts/
    tar -xzf /tmp/core-fonts.tar.gz -C ${DS_DOC_ROOT}/ && \
    mkdir -p ${DS_DOC_ROOT}/server/FileConverter/bin/empty/templates && \
    tar -xzf /tmp/templates.tar.gz -C ${DS_DOC_ROOT}/server/FileConverter/bin/empty/ --strip-components=1 && \
    rm -f /tmp/dictionaries.tar.gz /tmp/schema.tar.gz /tmp/core-fonts.tar.gz /tmp/templates.tar.gz

# 5. local.json 覆盖（关键两项：blockPrivateIP=false 允许下载私有 IP；LD_PRELOAD=libstdc++ 供 x2t 子进程）
COPY custom-local.json /etc/onlyoffice/documentserver/local.json

# 6. DoctRenderer.config（容器内绝对路径：sdkjs / allfonts 位置）
COPY DoctRenderer.config ${DS_DOC_ROOT}/server/FileConverter/bin/DoctRenderer.config

# 修正权限
RUN chown -R onlyoffice:onlyoffice ${DS_DOC_ROOT} 2>/dev/null || true

# eCTD 演示文档（宿主集成 demo 用）。example 把文档存在 /var/lib/onlyoffice/...，
# 那是匿名卷（容器重建即丢）；这里放一份镜像内固定路径，entrypoint 启动时分发。
COPY ["WHO eCTD Guidance for Industry v1.0.pdf", "/opt/onlyoffice-example-docs/"]

# 用我们自己的 entrypoint：先准备 example 服务需要的示例文件，
# 再 exec run-document-server.sh（保留它的所有初始化逻辑）
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

# forcesave → 主文件同步守护（entrypoint 会启动它）。
# 背景：点 Save(forcesave/status 6) 时 example 只把结果写入
# <file>-history/<file>（崩溃保护副本），故意不更新主文件；主文件只在
# status 2（最后一个编辑者关闭且仍有未保存改动）时才写。导致"点保存→
# 刷新"看不到文件变化、会话丢失后重开像"恢复原样"（2026-10-10 查明）。
# 守护轮询该副本并回写主文件，使"点保存"具备真正的持久化语义。
COPY forcesave-main-sync.sh /usr/local/bin/forcesave-main-sync.sh
RUN chmod 755 /usr/local/bin/forcesave-main-sync.sh

# 7. example 服务（/example/editor 演示页）的模板编译在单文件可执行程序里，
#    浏览器标签标题会显示 "<文件名> - ONLYOFFICE"（首页也有大量 ONLYOFFICE 文案）。
#    无法改模板，故在 nginx 反向代理层用 sub_filter 统一替换为 Online Office。
#    同时清掉 ETag/Last-Modified，避免浏览器用旧的 304 缓存继续显示旧标题。
RUN set -eux; \
    f=/etc/onlyoffice/documentserver-example/nginx/includes/ds-example.conf; \
    perl -0pi -e 's{(location /example/ \{)}{$1\n  sub_filter "ONLYOFFICE" "Online Office";\n  sub_filter_once off;\n  proxy_set_header Accept-Encoding "";\n  proxy_hide_header ETag;\n  proxy_hide_header Last-Modified;\n}' "$f"; \
    grep -q 'sub_filter "ONLYOFFICE" "Online Office"' "$f"

# 暴露端口
EXPOSE 80 443

# 用自定义入口（默认是 run-document-server.sh；我们的 wrapper 先复制示例文件再 exec 官方入口）
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD []