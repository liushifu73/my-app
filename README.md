# my-app

一个 DeepSeek Harness（DSH）插件：文献库面板 + `my_app_library` 工具。

## 装

在 DSH 里 **插件 → 添加插件**，选本目录；或者让 Agent 用 `plugin_manager` 的 `install_bundle` 指向本目录。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主侧：注册 `my_app_library` 工具，注册 `/my-app/library`、`/my-app/reveal` 路由 |
| `client.js` | 浏览器侧：侧栏「文献库」按钮 + 浮层面板 |
| `cordis.patch.yml` | 把本包插入 loader 的插件行 |
| `locale/*.json` | 插件列表里的标题、说明 |
| `docs/DETAIL.md` | 插件详情页内容 |

## 开发

- 改 `index.js` 后需要重新安装（移除再安装）才会生效。
- 改 `client.js` 后刷新页面即可。
- 不依赖任何 DSH 包：工具定义用标准 JSON Schema，所以从任何目录安装都能加载。
