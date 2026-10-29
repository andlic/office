#!/usr/bin/env python3
"""Build sdkjs (pure Python concatenation, no Node.js needed).

Why: sdkjs/Makefile is a legacy wrapper that invokes grunt (which doesn't exist).
The actual builder is sdkjs/build/build.py — a pure-Python stdlib concat tool
that reads configs/{word,cell,slide,visio,externs}.json and emits
sdkjs/deploy/sdkjs/<product>/sdk-all{,-min}.js plus copied asset trees.

Usage:
  python3 build_sdkjs.py            # build all 4 products + desktop extras
  python3 build_sdkjs.py --product word   # build one product
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS_ROOT = os.environ.get("DS_ROOT", os.path.dirname(HERE))
SDKJS = f"{DS_ROOT}/sdkjs"

ENV = {
    **os.environ,
    "PRODUCT_VERSION": "9.4.0",
    "BUILD_NUMBER": "1",
    "COMPANY_NAME": "ONLYOFFICE",
    "PRODUCT_NAME": "DocumentServer",
    "APP_COPYRIGHT": "Copyright (C) Ascensio System SIA 2009-2026. All rights reserved",
    "PUBLISHER_URL": "https://www.onlyoffice.com/",
}


def main():
    os.chdir(SDKJS)

    # 不传 --desktop：那是给 ONLYOFFICE Desktop Editor 用的，会把
    # common/Local/common.js（包含 ascdesktop:// 协议覆盖）编进 web sdkjs，
    # 导致浏览器 CORS 拒绝字体二进制加载（"Loading document" 卡死）
    args = ["python3", "build/build.py"]
    if "--product" in sys.argv:
        i = sys.argv.index("--product")
        args += ["--product", sys.argv[i + 1]]

    print("=" * 60)
    print("Building sdkjs...")
    print("cmd:", " ".join(args))
    print("cwd:", SDKJS)
    print("=" * 60)
    subprocess.check_call(args, env=ENV)

    out = SDKJS + "/deploy/sdkjs/"
    print()
    print("=" * 60)
    print("sdkjs build done.")
    print(f"Output: {out}")
    print("=" * 60)

    # Show what was built
    for product in ("word", "cell", "slide", "visio"):
        js = f"{out}{product}/sdk-all.js"
        if os.path.isfile(js):
            size_mb = os.path.getsize(js) / (1024 * 1024)
            print(f"  ✓ {product}/sdk-all.js ({size_mb:.1f} MB)")
        js_min = f"{out}{product}/sdk-all-min.js"
        if os.path.isfile(js_min):
            size_mb = os.path.getsize(js_min) / (1024 * 1024)
            print(f"  ✓ {product}/sdk-all-min.js ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()