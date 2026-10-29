# 分卷文件说明

因 GitHub 单文件 100MB 硬限制，以下 tarball 以 `<原文件名>.part-NNN` 分卷形式存放：

- `core-bin.tar.gz`
- `core-fonts.tar.gz`
- `dictionaries.tar.gz`
- `server.tar.gz`
- `templates.tar.gz`
- `webapps-deploy.tar.gz`

在服务器上需要使用时，在本目录执行 `sh reassemble.sh` 合并还原（分卷按序号顺序拼接）。
合并后原始分卷不会被删除；如需清理请自行删除 `*.part-*`。
