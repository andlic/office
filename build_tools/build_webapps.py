#!/usr/bin/env python3
"""Build web-apps (Grunt + npm install). Requires sdkjs already built.

Why: web-apps/build/Gruntfile.js uses Grunt 1.6.1 to bundle 6 editor UIs.
The default grunt task runs deploy-{common,documenteditor,spreadsheeteditor,
presentationeditor,pdfeditor,visioeditor}-component. Outputs to
web-apps/deploy/web-apps/apps/<editor>/main/app.js (and more).

Prerequisite: sdkjs must already be built (the deploy-sdk task copies
sdkjs/{word,cell,slide,pdf} bundles into web-apps/deploy/sdkjs/).

Usage:
  python3 build_webapps.py [--skip-npm] [--grunt-task TASK]
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS_ROOT = os.environ.get("DS_ROOT", os.path.dirname(HERE))
NODE_BIN = f"{HERE}/tools/linux/node/default/bin"
WA = f"{DS_ROOT}/web-apps/build"

ENV = {
    **os.environ,
    "PATH": NODE_BIN + ":" + os.environ.get("PATH", ""),
    "PRODUCT_VERSION": "9.4.0",
    "BUILD_NUMBER": "1",
}


def run(cmd, cwd=None, env=None, check=True):
    print(f"$ {' '.join(cmd)}")
    return subprocess.check_call(cmd, cwd=cwd, env=env) if check else subprocess.call(cmd, cwd=cwd, env=env)


def main():
    skip_npm = "--skip-npm" in sys.argv
    grunt_task = "default"
    if "--grunt-task" in sys.argv:
        grunt_task = sys.argv[sys.argv.index("--grunt-task") + 1]

    # Verify sdkjs exists
    sdkjs_root = f"{DS_ROOT}/sdkjs/deploy/sdkjs"
    if not os.path.isfile(os.path.join(sdkjs_root, "word/sdk-all.js")):
        print(f"ERROR: sdkjs not built yet. Run build_sdkjs.py first.")
        print(f"Missing: {sdkjs_root}/word/sdk-all.js")
        sys.exit(1)

    # 1) npm install (only first time or after package.json changes)
    if not skip_npm:
        print("=" * 60)
        print("Step 1/2: npm install in web-apps/build")
        print("=" * 60)
        run(["npm", "install", "--no-audit", "--no-fund", "--prefer-offline"],
            cwd=WA, env=ENV)
    else:
        print("=== Skipping npm install (--skip-npm) ===")

    # 2) grunt
    print()
    print("=" * 60)
    print(f"Step 2/2: grunt {grunt_task}")
    print("=" * 60)
    # 注意：Gruntfile.js 是 module.exports=function(grunt) 风格，直接
    # `node Gruntfile.js <task>` 是空操作（只定义函数、从不调用，且退出 0）——
    # 必须经 grunt-cli 启动，否则 deploy/ 永远不会刷新（2026-10-19 查明）。
    grunt = os.path.join(WA, "node_modules", ".bin", "grunt")
    if not os.path.isfile(grunt):
        print(f"ERROR: grunt-cli not found: {grunt}")
        sys.exit(1)
    run([grunt, grunt_task, "--no-color"], cwd=WA, env=ENV)

    # 防呆：确认 grunt 真的产出了（此前的空操作 bug 退出码为 0，靠退出码无法发现）
    deploy_appjs = f"{DS_ROOT}/web-apps/deploy/web-apps/apps/documenteditor/main/app.js"
    if not os.path.isfile(deploy_appjs):
        print(f"ERROR: grunt finished but deploy output missing: {deploy_appjs}")
        sys.exit(1)

    print()
    print("=" * 60)
    print("web-apps build done.")
    print("=" * 60)

    # Show what was built
    deploy = f"{DS_ROOT}/web-apps/deploy"
    print(f"Output: {deploy}/")
    if os.path.isdir(deploy):
        for d in sorted(os.listdir(deploy)):
            full = os.path.join(deploy, d)
            if os.path.isdir(full):
                size = sum(os.path.getsize(os.path.join(r, f))
                           for r, _, fs in os.walk(full) for f in fs)
                print(f"  ✓ {d}/ ({size // (1024*1024)} MB)")


if __name__ == "__main__":
    main()