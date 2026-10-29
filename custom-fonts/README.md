# custom-fonts — 构建时植入的字体

放要内置进镜像的字体（`.ttf` / `.ttc` / `.otf`，可分子目录），然后重建镜像：

```bash
cd ../build_tools && sudo ./docker_build_reload.sh
```

流程：`custom-fonts/` →（docker_build.sh 合并进 core-fonts.tar.gz）→ 容器
`/var/www/.../core-fonts/custom/` → 启动时自动扫描生成字体列表与索引 →
编辑器字体下拉和 PDF 导出随之生效。

注意事项：

- 不要放 `.fon`（位图字体，不支持）或 `desktop.ini` 之类的非字体文件
- 为什么不放 `core-fonts/`：那是 git submodule，加文件会被 submodule 操作清掉
- Windows 字体是商用授权，对外分发镜像前请确认授权；每 100 个字体约增加几百 MB 镜像体积
- 不想重建镜像快速验证：把字体 `docker cp` 进运行容器的
  `$DS/core-fonts/custom/`，重跑 `documentserver-generate-allfonts.sh`，刷新浏览器
