#!/bin/bash
# entrypoint wrapper: 在 run-document-server.sh 之前准备好 example 服务需要的示例文件
#
# example 服务（端口 3000）从 /var/lib/onlyoffice/documentserver-example/files/<userAddr>/ 找文件
# 不存在就报 500 "File not found"。
#
# run-document-server.sh 不会自动复制示例文件 — 那要由 docker volume mount 提供，
# 但本地 dev 没 mount，所以这里复制一份到 /var/www/onlyoffice/documentserver-example/files/<host-ip>/。
#
# <host-ip> 从外部 defaultRoute 解析（容器默认 gateway 172.17.0.1）

set -e

EXAMPLE_FILES_DIR="/var/lib/onlyoffice/documentserver-example/files"
DS_DOC_ROOT="${DS_DOC_ROOT:-/var/www/onlyoffice/documentserver}"
DOC_TEMPLATES="$DS_DOC_ROOT/document-templates"

# 字体二进制：sdkjs 客户端用 basePath + 字体 ID（如 /fonts/046）通过 XHR 加载
# nginx 配置（ds-docservice.conf）把 /<hash>/fonts/* alias 到 $DS_DOC_ROOT/fonts/*
# 但 allfontsgen 把字体文件写到 $DS_DOC_ROOT/server/FileConverter/bin/fonts/
# （这是 server 端转换时用的位置），不在 $DS_DOC_ROOT/fonts/ 下
# 所以这里建符号链接让浏览器加载也能命中
if [ -d "$DS_DOC_ROOT/server/FileConverter/bin/fonts" ] && [ ! -e "$DS_DOC_ROOT/fonts" ]; then
    ln -s server/FileConverter/bin/fonts "$DS_DOC_ROOT/fonts"
    echo "[entrypoint] linked $DS_DOC_ROOT/fonts -> server/FileConverter/bin/fonts"
fi

# 用户地址：本机 IPv4（172.17.0.1 是 docker 默认 bridge gateway）
# 浏览器通过 X-Forwarded-For 头告诉后端 client address，example 服务用它做 userdir
USERADDR="${EXAMPLE_USERADDR:-172.17.0.1}"

if [ -d "$DOC_TEMPLATES" ]; then
    mkdir -p "$EXAMPLE_FILES_DIR/$USERADDR"
    # 只复制内置模板（new 和 sample）
    for src in new sample; do
        if [ -d "$DOC_TEMPLATES/$src" ]; then
            cp -rn "$DOC_TEMPLATES/$src/." "$EXAMPLE_FILES_DIR/$USERADDR/" || true
        fi
    done
    # new 是按语言的子目录结构，要取一个具体语言版本
    if [ -d "$DOC_TEMPLATES/new/en-US" ] && [ ! -f "$EXAMPLE_FILES_DIR/$USERADDR/new.docx" ]; then
        cp -rn "$DOC_TEMPLATES/new/en-US/." "$EXAMPLE_FILES_DIR/$USERADDR/" || true
    fi
    chown -R ds:ds "$EXAMPLE_FILES_DIR" || true
    echo "[entrypoint] example files staged for userAddr=$USERADDR"
fi

# eCTD 演示文档：example 存储 /var/lib/onlyoffice/... 是匿名卷，容器重建就丢，
# 从镜像内固定路径补回，保证 /example/editor?fileName=WHO... 每次都能打开。
if [ -d /opt/onlyoffice-example-docs ]; then
    mkdir -p "$EXAMPLE_FILES_DIR/$USERADDR"
    cp -rn /opt/onlyoffice-example-docs/. "$EXAMPLE_FILES_DIR/$USERADDR/" || true
    chown -R ds:ds "$EXAMPLE_FILES_DIR" || true
    echo "[entrypoint] eCTD demo docs staged for userAddr=$USERADDR"
fi

# forcesave → 主文件同步守护（详见 /usr/local/bin/forcesave-main-sync.sh 头注释）。
# 点 Save(forcesave/status 6) 时 example 只写 <file>-history/<file> 崩溃副本，
# 主文件要等 status 2（最后一人关闭且仍有未保存改动）才更新。守护把副本回写主文件。
if [ -f /usr/local/bin/forcesave-main-sync.sh ]; then
    pkill -f forcesave-main-sync.sh 2>/dev/null || true
    nohup /usr/local/bin/forcesave-main-sync.sh >/tmp/forcesave-main-sync.log 2>&1 &
    echo "[entrypoint] forcesave-main-sync daemon started"
fi

exec /app/ds/run-document-server.sh "$@"