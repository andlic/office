#!/usr/bin/env bash
# docker_build_reload.sh — 重打镜像并热替换运行中的容器
#
# 流程：
#   1. 停 + 删旧容器（数据卷不会被删）
#   2. 调 docker_build.sh 重打镜像
#   3. 用相同参数启动新容器
#   4. 等 /healthcheck 返回 true
#
# 用法：
#   sudo ./docker_build_reload.sh                    # 默认配置
#   sudo ./docker_build_reload.sh --skip-build       # 跳过本地编译
#   sudo ./docker_build_reload.sh --skip-tar          # 跳过 tar 打包
#   sudo ./docker_build_reload.sh --tag myname:v1    # 自定义 tag
#
# 持久化数据：
#   命名卷 onlyoffice-data 挂到 /var/lib/onlyoffice（example 的文档、-history 版本目录、
#   DS 缓存都在这里）。不挂卷时 docker rm 会产生新的匿名卷 → 每次重建文档和
#   "操作历史"全部丢失（2026-10-21 实测）。命名卷在容器重建间保留；
#   如需重置数据，手动 docker volume rm onlyoffice-data。

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-onlyoffice-documentserver}"
IMAGE_TAG="${IMAGE_TAG:-onlyoffice/documentserver:local}"
PORT_HTTP="${PORT_HTTP:-80}"
PORT_HTTPS="${PORT_HTTPS:-443}"
HEALTH_URL="http://localhost:${PORT_HTTP}/healthcheck"
# 持久化 example 存储（文档 + 版本历史 + DS 缓存）：容器重建不丢
DATA_VOLUME="${DATA_VOLUME:-onlyoffice-data}"

# 转发给 docker_build.sh 的参数
BUILD_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --skip-build|--skip-tar|--help|-h)
            BUILD_ARGS+=("$arg") ;;
        --tag=*)
            IMAGE_TAG="${arg#--tag=}"
            BUILD_ARGS+=("$arg") ;;
        --tag)
            shift
            IMAGE_TAG="$1"
            BUILD_ARGS+=("--tag" "$1") ;;
        --container=*)
            CONTAINER_NAME="${arg#--container=}" ;;
        --http=*)
            PORT_HTTP="${arg#--http=}" ;;
        --https=*)
            PORT_HTTPS="${arg#--https=}" ;;
        *)
            echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

echo "========================================"
echo "1/4 停 + 删旧容器: $CONTAINER_NAME"
echo "========================================"
if sudo docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    sudo docker stop "$CONTAINER_NAME" || true
    sudo docker rm "$CONTAINER_NAME" || true
    echo "✓ 旧容器已删除"
else
    echo "  (旧容器不存在，跳过)"
fi

echo
echo "========================================"
echo "2/4 重打镜像: $IMAGE_TAG"
echo "========================================"
echo "  调 docker_build.sh ${BUILD_ARGS[*]:-(full build)}"
cd "$HERE"
# 用 sudo 跑本脚本时以 $SUDO_USER 降权执行编译/打包：build_all 的产物（node_modules、
# .docker-ctx、deploy 目录等）归普通用户所有，否则下次非 root 跑构建会 EACCES（root
# 属主污染）。docker 命令脚本内部已自带 sudo，不受影响。
if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    echo "  （root 身份检测到，降权为 $SUDO_USER 执行本地编译/打包）"
    sudo -u "$SUDO_USER" -H ./docker_build.sh "${BUILD_ARGS[@]}"
else
    ./docker_build.sh "${BUILD_ARGS[@]}"
fi
echo "✓ 镜像构建完成"

echo
echo "========================================"
echo "3/4 启动新容器"
echo "========================================"
sudo docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${PORT_HTTP}:80" \
    -p "${PORT_HTTPS}:443" \
    -v "${DATA_VOLUME}:/var/lib/onlyoffice" \
    "$IMAGE_TAG"
echo "✓ 容器已启动"

echo
echo "========================================"
echo "4/4 等待 /healthcheck 返回 true"
echo "========================================"
for i in $(seq 1 60); do
    status=$(curl -fsS -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        echo "✓ healthcheck OK (attempt $i)"
        exit 0
    fi
    sleep 2
done

echo "✗ healthcheck 60 次仍未通过（最后状态 $status）"
echo "  看日志: sudo docker logs $CONTAINER_NAME"
exit 1
