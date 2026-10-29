#!/usr/bin/env bash
# docker_build.sh — 构建自定义 DocumentServer Docker 镜像
#
# 流程：
#   1. 调用 build_all.py 在本地编译所有组件
#   2. 把产物打包成 tar.gz（每个大目录一个 tar，避免 COPY 几十万小文件）
#   3. 准备一个只含 tar 的 build context（避免把 12GB 项目根送给 docker daemon）
#   4. 用 Dockerfile.custom 把 tar 打进 Docker 镜像
#
# 用法：
#   ./docker_build.sh                    # 全量构建 + 打包镜像
#   ./docker_build.sh --skip-build       # 跳过本地编译，只打包
#   ./docker_build.sh --skip-tar          # 跳过 tar 步骤（如果产物没变）
#   ./docker_build.sh --tag myname:1.0   # 指定镜像 tag
#   TAG=foo ./docker_build.sh            # 同上
#
# 镜像 tag 默认：onlyoffice/documentserver:local

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$HERE/.." && pwd)"
DS_DIR="${DS_ROOT:-$PROJECT_ROOT}"

TAG="${TAG:-onlyoffice/documentserver:local}"
SKIP_BUILD=0
SKIP_TAR=0

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-tar)   SKIP_TAR=1 ;;
    --tag=*)      TAG="${arg#--tag=}" ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

cd "$HERE"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "=== 1. 本地全量编译 ==="
  python3 build_all.py
fi

# 准备 build context：只含 tar + Dockerfile，避免 docker 把 12GB 项目根送给 daemon
CTX_DIR="$HERE/.docker-ctx"
rm -rf "$CTX_DIR"
mkdir -p "$CTX_DIR"
cp "$HERE/Dockerfile.custom" "$CTX_DIR/Dockerfile"
# 这两个文件 Dockerfile.custom 第 17/18 步要用到
cp "$HERE/custom-local.json" "$CTX_DIR/custom-local.json"
cp "$HERE/DoctRenderer.config" "$CTX_DIR/DoctRenderer.config"
cp "$HERE/docker-entrypoint.sh" "$CTX_DIR/docker-entrypoint.sh"
cp "$HERE/forcesave-main-sync.sh" "$CTX_DIR/forcesave-main-sync.sh"
# eCTD 演示文档：example 服务的存储（/var/lib/onlyoffice/...）是匿名卷，容器重建即丢。
# 放进镜像后由 entrypoint 每次启动分发，保证 /example/editor?fileName=WHO... 稳定可开。
cp "$DS_DIR/web-client/docs/WHO eCTD Guidance for Industry v1.0.pdf" \
   "$CTX_DIR/WHO eCTD Guidance for Industry v1.0.pdf"

if [[ "$SKIP_TAR" -eq 0 ]]; then
  echo
  echo "=== 2. 把大目录打包成 tar.gz ==="
  # 清掉 deploy 里的陈旧 gzip 旁路（nginx gzip_static 会优先发 .gz；容器启动时 static-gzip 会重建）
  find "$DS_DIR/web-apps/deploy" "$DS_DIR/sdkjs/deploy" -name '*.gz' -delete 2>/dev/null || true
  # web-apps 部署目录 777M，21k 文件
  if [[ -d "$DS_DIR/web-apps/deploy/web-apps" ]]; then
    echo "  • webapps-deploy.tar.gz (web-apps 部署产物)"
    tar -czf "$CTX_DIR/webapps-deploy.tar.gz" -C "$DS_DIR/web-apps/deploy" web-apps
  fi
  # sdkjs 部署目录
  if [[ -d "$DS_DIR/sdkjs/deploy/sdkjs" ]]; then
    echo "  • sdkjs-deploy.tar.gz (sdkjs 部署产物)"
    tar -czf "$CTX_DIR/sdkjs-deploy.tar.gz" -C "$DS_DIR/sdkjs/deploy" sdkjs
  fi
  # server 整套（487M，60k 文件）
  if [[ -d "$DS_DIR/server" ]]; then
    echo "  • server.tar.gz (server + node_modules)"
    tar -czf "$CTX_DIR/server.tar.gz" -C "$DS_DIR" server
  fi
fi

# core bin/lib 单独 COPY（文件少），但 tar 时把 bin/linux_64/* 和 lib/linux_64/*
# 直接放在 tar 根，免去目录嵌套
if [[ -d "$DS_DIR/core/build/bin/linux_64" ]]; then
  echo "  • core-bin.tar.gz (core 二进制，平铺在根)"
  tar -czf "$CTX_DIR/core-bin.tar.gz" -C "$DS_DIR/core/build/bin/linux_64" .
fi
if [[ -d "$DS_DIR/core/build/lib/linux_64" ]]; then
  echo "  • core-lib.tar.gz (core 库，平铺在根)"
  tar -czf "$CTX_DIR/core-lib.tar.gz" -C "$DS_DIR/core/build/lib/linux_64" .
fi

# dictionaries, schema, fonts, templates (文件少，可以 COPY)
# 由于这些目录的源在 DocumentServer 下（已是 symlink），直接 tar 进 context
[[ -d "$DS_DIR/dictionaries" ]] && tar -czf "$CTX_DIR/dictionaries.tar.gz" -C "$DS_DIR" dictionaries
[[ -d "$DS_DIR/server/schema" ]] && tar -czf "$CTX_DIR/schema.tar.gz" -C "$DS_DIR/server" schema
# core-fonts 是 git submodule；自定义字体放顶层 custom-fonts/，用 tar 变换并入 core-fonts/custom/
if [[ -d "$DS_DIR/custom-fonts" ]]; then
  [[ -d "$DS_DIR/core-fonts" ]] && tar -czf "$CTX_DIR/core-fonts.tar.gz" -C "$DS_DIR" \
    --transform='s,^custom-fonts,core-fonts/custom,' core-fonts custom-fonts
else
  [[ -d "$DS_DIR/core-fonts" ]] && tar -czf "$CTX_DIR/core-fonts.tar.gz" -C "$DS_DIR" core-fonts
fi
[[ -d "$DS_DIR/document-templates" ]] && tar -czf "$CTX_DIR/templates.tar.gz" -C "$DS_DIR" document-templates

echo
echo "  Build context 内容："
ls -lh "$CTX_DIR/"

echo
echo "=== 3. 打包 Docker 镜像 ==="
echo "    tag:  $TAG"
echo "    ctx:  $CTX_DIR"
cd "$CTX_DIR"
# 用 buildx (BuildKit) 而非老的 builder，buildx 对大文件 + 多 COPY 更高效
docker buildx build \
  -f "$CTX_DIR/Dockerfile" \
  -t "$TAG" \
  --load \
  "$CTX_DIR"

echo
echo "=== 完成 ==="
echo "镜像已构建：$TAG"
echo "运行：sudo docker run --rm -p 80:80 $TAG"

# 清理（可选：保留以加速后续 build）
# rm -rf "$CTX_DIR"