#!/usr/bin/env python3
"""Install server npm dependencies (Common / DocService / FileConverter / Metrics).

Why: server's package.json "build" is a parallel run of npm ci in 4 sub-packages.
Native modules like sharp/oracledb may fail postinstall on first run — use
--ignore-scripts to skip and re-run if needed.

Usage:
  python3 build_server_deps.py            # install all
  python3 build_server_deps.py --ignore-scripts  # skip native module postinstalls
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DS_ROOT = os.environ.get("DS_ROOT", os.path.dirname(HERE))
NODE_BIN = f"{HERE}/tools/linux/node/default/bin"
SERVER = f"{DS_ROOT}/server"

ENV = {
    **os.environ,
    "PATH": NODE_BIN + ":" + os.environ.get("PATH", ""),
}


def run(cmd, cwd=None):
    print(f"$ cd {cwd} && {' '.join(cmd)}")
    return subprocess.check_call(cmd, cwd=cwd, env=ENV)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ignore-scripts", action="store_true",
                    help="Skip native postinstall scripts (sharp, oracledb, etc.)")
    ap.add_argument("--sub", action="append", default=[],
                    help="Only install specific sub-package(s)")
    args = ap.parse_args()

    npm_args = ["npm", "ci", "--no-audit", "--no-fund"]
    if args.ignore_scripts:
        npm_args.append("--ignore-scripts")

    # Root dev deps (eslint, jest, prettier...)
    if not args.sub or "root" in args.sub:
        print("=" * 60)
        print("Step 1/5: server root npm ci (dev deps)")
        print("=" * 60)
        # Use shrinkwrap at root level
        try:
            run(npm_args + ["--foreground-scripts"], cwd=SERVER)
        except subprocess.CalledProcessError:
            print("Root npm ci failed — probably missing package-lock.json.")
            print("Trying npm install instead (will not use shrinkwrap):")
            run(["npm", "install", "--no-audit", "--no-fund"], cwd=SERVER)

    subpkgs = ["Common", "DocService", "FileConverter", "Metrics"]
    for sub in subpkgs:
        if args.sub and sub not in args.sub and "root" not in args.sub:
            continue
        sub_dir = SERVER + "/" + sub
        print()
        print("=" * 60)
        print(f"Step: {sub} npm ci")
        print("=" * 60)
        try:
            run(npm_args, cwd=sub_dir)
        except subprocess.CalledProcessError as e:
            print(f"!! {sub} failed: {e}")
            print("   Retry with --ignore-scripts if native postinstall broke")

    print()
    print("=" * 60)
    print("server deps done.")
    for sub in subpkgs:
        nm = SERVER + "/" + sub + "/node_modules"
        if os.path.isdir(nm):
            count = sum(1 for _ in os.listdir(nm))
            print(f"  ✓ {sub}/node_modules/ ({count} entries)")
    print("=" * 60)


if __name__ == "__main__":
    main()