#!/bin/bash
# forcesave-main-sync.sh — 把 example 服务的 forcesave 副本同步回主文件
#
# 背景（2026-10-10 从 example 源码 docManager.js/app.js 确认）：
#   用户在编辑器里点 Save 走的是 forcesave（回调 status=6）。example 对 status=6
#   只把结果写入 <file>-history/<file>（崩溃保护副本），**故意不更新主文件**；
#   主文件只在 status=2（最后一个编辑者关闭且文档仍有未保存改动）时才被写入。
#   于是"点保存 → 刷新"永远看不到文件更新；一旦内存会话丢失（重启/超时），
#   重开文档加载的仍是旧主文件 → 表现为"保存后刷新又恢复原样"。
#
#   本守护轮询各 <file>-history/<file> 副本，发现它比主文件新（且大小稳定两轮）
#   就覆盖主文件，使"点保存"具备真正的持久化语义（与标准连接器一致）。
#
# 语义说明：直接覆盖主文件（不走 example 的版本归档记账），版本历史 UI 中
#   这一跳会缺失一条记录，属可接受近似；后续 status=2 保存仍按正常流程归档。

BASE=/var/lib/onlyoffice/documentserver-example/files
STATE=/tmp/.forcesave-sync
mkdir -p "$STATE" 2>/dev/null

while true; do
  for h in "$BASE"/*/*-history; do
    [ -d "$h" ] || continue
    base=$(basename "$h"); name="${base%-history}"
    fs="$h/$name"; main="$(dirname "$h")/$name"
    [ -f "$fs" ] || continue
    [ -f "$main" ] || continue
    if [ "$fs" -nt "$main" ]; then
      cur=$(stat -c %s "$fs" 2>/dev/null)
      key=$(printf '%s' "$fs" | md5sum | cut -c1-16)
      prev=$(cat "$STATE/$key" 2>/dev/null || echo "")
      if [ -n "$cur" ] && [ "$cur" = "$prev" ]; then
        # 大小连续两轮稳定 → 认为写入完成 → 覆盖主文件
        cp -f "$fs" "$main" 2>/dev/null && rm -f "$STATE/$key" 2>/dev/null
      else
        printf '%s' "$cur" > "$STATE/$key" 2>/dev/null
      fi
    fi
  done
  sleep 2
done
