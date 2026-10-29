#!/bin/sh
# 合并 .part-NNN 分卷，还原为原始文件。
set -e
cd "$(dirname "$0")"
for first in *.part-000; do
    [ -e "$first" ] || continue
    base=${first%.part-000}
    if [ -e "$base" ]; then
        echo "skip (已存在): $base"
        continue
    fi
    cat "$base".part-* > "$base"
    echo "restored: $base"
done
