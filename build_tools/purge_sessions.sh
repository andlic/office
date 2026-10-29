#!/usr/bin/env bash
# purge_sessions.sh — 清空 docservice 里所有残留编辑会话
#
# 背景（2026-10-09 实测确认的幽灵覆盖问题）：
#   example 应用的文档 key = IP + 文件名 + 文件mtime(ms)。每次保存都会改变
#   文件 mtime → 之后再打开编辑器就产生【新 key = 新会话】，而旧标签页的
#   会话还活着（docservice 内存里）。旧会话里若有未保存的编辑，它最终的
#   迟到保存会把【它打开时的旧状态】写回文件，覆盖掉新内容——现象就是
#   “修改书签并保存成功，刷新后却恢复原样”。
#
#   本脚本重启 ds:docservice，杀掉全部内存会话，掐断幽灵写入。
#   之后请关闭所有旧编辑器标签页，只留一个新开的。
#
# 用法:
#   cd build_tools/
#   ./purge_sessions.sh
#
# 注意：重启会断开所有正在编辑的客户端（约 10 秒不可用）。
#       已保存的文件内容不受影响。

set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-onlyoffice-documentserver}"
PORT_HTTP="${PORT_HTTP:-80}"

echo "重启 ds:docservice（清空所有内存会话）…"
sudo docker exec "$CONTAINER_NAME" supervisorctl restart ds:docservice

echo -n "等待 healthcheck "
for i in $(seq 1 30); do
    if [ "$(curl -fsS "http://localhost:${PORT_HTTP}/healthcheck" 2>/dev/null)" = "true" ]; then
        echo "✓ OK（第 $i 次）"
        echo
        echo "完成。别忘了：关闭所有旧的编辑器标签页，只保留一个新开的。"
        exit 0
    fi
    echo -n "."
    sleep 2
done

echo
echo "✗ 30 次健康检查未通过，请查看: sudo docker logs $CONTAINER_NAME"
exit 1
