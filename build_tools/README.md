# build_tools

ONLYOFFICE DocumentServer 本地构建工具链（2026-09-23 已从 `/home/hjg/project/build_tools/` 挪入源码仓库）。

## 快速开始

```bash
cd "$(dirname "$(pwd)")"   # 假设在 build_tools/ 内；DS_ROOT 自动设为父目录

# 或直接：
cd $DS_ROOT/build_tools    # DS_ROOT 默认指向 DocumentServer/

# 一键全量编译
python3 build_all.py

# 重打 Docker 镜像 + 热替换容器
sudo ./docker_build_reload.sh

# 看完整文档
cat MANUAL.md
```

## 配置 JWT（如需要）

镜像默认 `JWT_ENABLED=false` + `JWT_SECRET=mysecret123` 稳定不变。详细三层覆盖见 [MANUAL.md §A.8](./MANUAL.md#a8-jwt-secret-配置三层覆盖)。

## 文件清单

| 文件 | 作用 |
|---|---|
| `build_all.py` | 一键编排：core → sdkjs → web-apps → server |
| `build_core_only.py` | 只编 C++ 核心（x2t / libdoctrenderer.so）|
| `build_sdkjs.py` | 纯 Python 拼接 sdk-all.js |
| `build_webapps.py` | Grunt 编 6 个编辑器 UI |
| `build_server_deps.py` | npm ci 装 server 依赖 |
| `docker_build.sh` | 打 Docker 镜像 |
| `docker_build_reload.sh` | 重打镜像 + 热替换容器 |
| `Dockerfile.custom` | Docker 镜像构建脚本 |
| `DoctRenderer.config` | 容器内 DoctRenderer 路径配置 |
| `custom-local.json` | 注入镜像的 local.json（LD_PRELOAD + 私网放行）|
| `MANUAL.md` | 完整维护手册 |
| `tools/linux/node/default/` | 本地 Node.js 20.18.0 |
| `scripts/` | DocumentServer 官方构建框架（make.py 依赖）|
| `.docker-ctx/` | Docker 构建上下文（tar + Dockerfile）|

## 路径配置

脚本用 `DS_ROOT` 环境变量定位源码根目录，默认值 = 脚本所在目录的**父目录**（即 `DocumentServer/`）。

```bash
# 默认
python3 build_all.py

# 自定义
DS_ROOT=/opt/DocumentServer python3 build_all.py
```

## 迁移机器

把整个 `DocumentServer/` 目录拷到新机器（`build_tools/` 在源码仓库内，跟随移动）。新机器只需：

```bash
# 1. 系统工具（apt）
sudo apt install -y build-essential cmake ninja-build python3 \
    default-jdk-headless git curl

# 2. Node.js（如果 build_tools/tools/linux/node/ 也一并拷过来，跳过 A.2）
# 3. 编译 v8（如果 /home/hjg/v8/ 也拷过来，且 libv8_monolith.a 存在，跳过 A.3）

cd build_tools
python3 build_all.py        # 编译
./docker_build.sh           # 打镜像
sudo ./docker_build_reload.sh
```

完整步骤见 [MANUAL.md](./MANUAL.md)。
