# my-app

一个 DeepSeek Harness（DSH）插件。

## 安装

在 DSH 里 **插件 → 添加插件**，选择本目录；或者用 `plugin_manager` 的 `install_bundle` 指向本目录。

## 开发

- `index.js`：插件入口，注册工具。
- `cordis.patch.yml`：把这个包插入 loader 的插件行。
- `locale/*.json`：插件列表里的标题和说明。
- `docs/DETAIL.md`：插件详情页显示的内容。

改完代码后重启 DSH（或重新安装）生效。
