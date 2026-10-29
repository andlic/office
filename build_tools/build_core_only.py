#!/usr/bin/env python3
"""
build_core_only.py — 增量编译 ONLYOFFICE core 的 C++ 部分，跳过 sdkjs/web-apps/server/deploy。

用法：
  python3 build_core_only.py

它会做：
  1. make_common.make()  — 拉/构建 3rdParty 依赖（boost/icu/openssl/harfbuzz 等）
  2. build_sln.make()     — 编译所有 C++ 目标（x2t, docbuilder, libdoctrenderer.so 等）

不会做：
  - build_js.make()       — sdkjs/web-apps (JS 编译，需要 npm)
  - build_server.make()   — Node.js Document Server
  - deploy.make()         — 部署包生成（依赖 SDK JS 产物）

为什么需要这个：
  make.py 不管 module 设置为什么，都会跑全部 5 个阶段。完整跑需要 npm + git submodule
  (sdkjs/web-apps/server) 才能结束。只想编译或修改 C++ 代码时，用这个更高效。
"""

import os
import sys

_DIRNAME = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_DIRNAME, 'scripts'))
sys.path.insert(0, os.path.join(_DIRNAME, 'scripts/core_common'))
sys.path.insert(0, os.path.join(_DIRNAME, 'scripts/core_common/modules'))

import config          # noqa: E402
import base            # noqa: E402
import make_common     # noqa: E402
import build_sln       # noqa: E402


def main():
    config.parse()
    base.check_python()
    base.check_build_version(_DIRNAME)
    base.configure_common_apps()

    print("=" * 60)
    print("Step 1/2: 3rdParty dependencies")
    print("=" * 60)
    make_common.make()

    print()
    print("=" * 60)
    print("Step 2/2: C++ core (build_sln)")
    print("=" * 60)
    build_sln.make()

    print()
    print("=" * 60)
    print("core C++ build done.")
    print(f"Binaries: {_DIRNAME}/../core/build/bin/linux_64/")
    print(f"Libraries: {_DIRNAME}/../core/build/lib/linux_64/")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)