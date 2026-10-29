#!/usr/bin/env python3
"""Build all DocumentServer components (core + sdkjs + web-apps + server deps).

Order matters:
  1. core C++ (x2t, docbuilder, libs)         → build_core_only.py
  2. sdkjs (Python concat, no npm)            → build_sdkjs.py
  3. web-apps (Grunt, needs sdkjs first)      → build_webapps.py
  4. server node_modules (Common/DocService/…) → build_server_deps.py

Usage:
  python3 build_all.py                        # full build
  python3 build_all.py --only core,sdkjs      # subset
  python3 build_all.py --skip-expensive        # same as --only core (no npm steps)
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(script, args=None):
    if args is None:
        args = []
    cmd = [sys.executable, os.path.join(HERE, script)] + args
    print()
    print("=" * 70)
    print(f">>> {script} {' '.join(args)}")
    print("=" * 70)
    subprocess.check_call(cmd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Comma-separated: core,sdkjs,webapps,server")
    ap.add_argument("--skip-expensive", action="store_true",
                    help="Only run core (skip npm-heavy steps)")
    args, _unknown = ap.parse_known_args()

    steps = ["core", "sdkjs", "webapps", "server"]
    if args.only:
        steps = [s.strip() for s in args.only.split(",")]
    if args.skip_expensive:
        steps = ["core"]

    if "core" in steps:
        run("build_core_only.py")
    if "sdkjs" in steps:
        run("build_sdkjs.py")
    if "webapps" in steps:
        run("build_webapps.py")
    if "server" in steps:
        run("build_server_deps.py", ["--ignore-scripts"])

    print()
    print("=" * 70)
    print("ALL BUILDS DONE.")
    print("Outputs:")
    print("  core    → onlyoffice/DocumentServer/core/build/{bin,lib}/linux_64/")
    print("  sdkjs   → onlyoffice/DocumentServer/sdkjs/deploy/sdkjs/")
    print("  webapps → onlyoffice/DocumentServer/web-apps/deploy/")
    print("  server  → onlyoffice/DocumentServer/server/{Common,DocService,FileConverter,Metrics}/node_modules/")
    print("=" * 70)


if __name__ == "__main__":
    main()