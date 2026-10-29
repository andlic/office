# ONLYOFFICE DocumentServer 9.4.0 维护手册

全部命令在 `build_tools/` 下执行（除注明路径）。首次搭建按 A 顺序；日常改动见 B。

## B. 日常修改：改了什么 → 跑什么

**两步**：① 重编改动产物 → ② 重打镜像 + 重启容器。

| 改了什么 | ① 重编命令 |
|---|---|
| core/ C++（x2t、.so 库） | `python3 build_core_only.py` |
| sdkjs/ JS | `python3 build_sdkjs.py` |
| web-apps/ JS/CSS | `python3 build_webapps.py --skip-npm` |
| server/ JS（无新依赖） | 不用（源码整目录打进 tar） |
| server/ package.json（新依赖） | `python3 build_server_deps.py` |
| build_tools/ 里的 Docker 配置 | 不用 |
| 字体（custom-fonts/ 或 core-fonts/） | 不用（容器启动自动重建索引） |

```bash
# ② 通用收尾
sudo ./docker_build_reload.sh --skip-build
```

- **`--skip-build` 必带**，否则会先跑 30–60 分钟全量编译
- 所有源码改动都要重打镜像（产物都 baked 进镜像）；仅运行参数（端口/卷/JWT）不用
- **铁律：所有修改必须通过重建镜像生效**。不要用 `docker cp` / 容器内改文件作为最终交付——热补只存在于容器层，重建即丢（历次事故根源）
- 升版本：`cd .. && git pull && cd build_tools && sudo ./docker_build_reload.sh`（全量；若 v8 变更先跑 A.3）

## A. 首次搭建（新机器，一次性，按顺序）

### A.1 系统工具
```bash
sudo apt install -y build-essential cmake ninja-build python3 default-jdk-headless git curl
```

### A.2 本地 Node.js（build_webapps.py / build_server_deps.py 依赖）
```bash
mkdir -p tools/linux/node && cd tools/linux/node
curl -L -o node.tar.gz https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
tar xzf node.tar.gz && mv node-v20.18.0-linux-x64 node-v20.18.0
ln -sf node-v20.18.0 default
```
> 构建脚本已自动处理 PATH；手动用 npm 须先 `export PATH="$(pwd)/default/bin:$PATH"`。
> 挪动 Node 目录必须删除后重解压（npm 内部有绝对路径引用）。

### A.3 编译 v8（~25 分钟，仅一次）
```bash
cd /home/hjg/v8/v8
python3 ./tools/dev/v8gen.py -vv8                 # 交互式输入 args.gn
ninja -C out.gn/linux_64 v8_monolith -j$(nproc)
```
跳过条件：`out.gn/linux_64/obj/libv8_monolith.a` 已存在。

### A.4 全量编译（~30 分钟）
```bash
python3 build_all.py        # core → sdkjs → web-apps → server deps
```

### A.5 字体索引（可选，通常不用）
容器启动时会自动生成权威数据。仅当想在镜像里预置一份兜底副本时，在 `DocumentServer/` 根目录跑：
```bash
mkdir -p core/build/bin/linux_64/fonts
LD_LIBRARY_PATH="$(pwd)/build_tools/out/linux_64/onlyoffice/core" \
  core/build/bin/linux_64/allfontsgen --use-system=true --input=core-fonts \
    --allfonts=core/build/bin/linux_64/fonts/AllFonts.js \
    --allfonts-web=core/build/bin/linux_64/fonts/AllFonts_web.js \
    --selection=core/build/bin/linux_64/fonts/font_selection.bin \
    --images=core/build/bin/linux_64/fonts --output-web=core/build/bin/linux_64/fonts
```
> 兜底副本记录的是宿主机字体路径，容器里基本用不上。
> 自定义字体：放 `DocumentServer/custom-fonts/` 即自动并入镜像（详见其 README）。

### A.6 打 Docker 镜像（~5 分钟）
```bash
./docker_build.sh
```

### A.7 首次启动
```bash
sudo docker run -d --name onlyoffice-documentserver -p 80:80 -p 443:443 onlyoffice/documentserver:local
curl http://localhost/healthcheck    # 应返回 true
```

### A.8 JWT（默认关闭）
启用/改 secret 的优先级：运行时 `-e` > 构建 `--build-arg` > 默认 `mysecret123`。
```bash
# 运行时启用
sudo docker run -d --name onlyoffice-documentserver -p 80:80 -p 443:443 \
    -e JWT_ENABLED=true -e JWT_SECRET=xxx onlyoffice/documentserver:local

# 烘焙进镜像
docker build --build-arg JWT_SECRET=xxx -f Dockerfile.custom \
    -t onlyoffice/documentserver:team --load .docker-ctx
```

## G. 镜像与容器

### G.1 重打镜像 + 重载容器（推荐）
```bash
sudo ./docker_build_reload.sh               # 全量重编（首次 / 升版本）
sudo ./docker_build_reload.sh --skip-build  # 产物已就绪（日常）
```

### G.2 只打镜像（不动容器）
```bash
./docker_build.sh                            # 全量
./docker_build.sh --skip-build --skip-tar    # 都不重编，只 docker build
TAG=myreg/ds:v9 ./docker_build.sh            # 自定义 tag
```
内部：编译 → 打 tar → 备 `.docker-ctx/` → 基于官方 9.4.0 叠加构建。镜像约 4.4GB。

### G.3 容器启停删
```bash
sudo docker stop  onlyoffice-documentserver
sudo docker start onlyoffice-documentserver     # 保留数据
sudo docker rm -f onlyoffice-documentserver     # 删容器（保留镜像）
sudo docker ps | grep documentserver            # 状态
```

### G.4 数据卷持久化（保留 Data / MySQL / Redis）
```bash
sudo docker run -d --name onlyoffice-documentserver -p 80:80 -p 443:443 \
    -v /path/data:/var/www/onlyoffice/Data \
    -v /path/mysql:/var/lib/mysql \
    -v /path/redis:/var/lib/redis \
    onlyoffice/documentserver:local
```
> 不挂卷时：容器重建会丢自定义字体（Data/custom-fonts）和数据库。

## D. 容器内操作

```bash
# 健康检查
curl http://localhost/healthcheck

# 重启服务（仅临时诊断用；正式修改走镜像重建）
sudo docker exec onlyoffice-documentserver supervisorctl restart ds:converter ds:docservice

# 重新生成字体索引（往容器加了字体后）
sudo docker exec onlyoffice-documentserver /usr/bin/documentserver-generate-allfonts.sh

# HTTP API 转换测试（docx → pdf）
curl -X POST http://localhost/ConvertService.ashx -H "Content-Type: application/json" \
  -d '{"async":false,"filetype":"docx","key":"k1","outputtype":"pdf","title":"k1.docx","url":"http://host:8080/sample.docx"}'

# 直接跑 x2t（绕开 HTTP API）
sudo docker exec onlyoffice-documentserver bash -c '
  LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libstdc++.so.6 \
  /var/www/onlyoffice/documentserver/server/FileConverter/bin/x2t /in.docx /out.pdf'

# 清残留编辑会话（"保存了、刷新却恢复原样"类问题）
./purge_sessions.sh

# forcesave 守护（点保存后自动回写主文件，随容器启动运行）
docker exec onlyoffice-documentserver ps -ef | grep [f]orcesave-main-sync
docker exec onlyoffice-documentserver tail /tmp/forcesave-main-sync.log

# 日志
sudo docker logs -f onlyoffice-documentserver
sudo docker exec onlyoffice-documentserver cat /var/log/onlyoffice/documentserver/converter/out.log
```

## F. 清理
```bash
rm -rf ../core/build/              # 清 core 产物（下次全量重编）
rm -rf /home/hjg/v8/v8/out.gn/     # 清 v8 产物（重编 ~25 分钟）
sudo docker rmi onlyoffice/documentserver:local
rm -rf .docker-ctx/                # 清构建上下文 tar（下次构建自动重建）
```
