# PdhAPI Image MCP

通过 [PdhAPI](https://pdhlzy.com) 在 Codex、Claude Code、Cursor 等 MCP 客户端中生成和编辑图片。默认接口为 `https://pdhlzy.com`，使用用户自己的 PdhAPI Key。

面向普通用户的三步配置说明：[USER_GUIDE.md](USER_GUIDE.md)。

**当前版本：0.1.0，本地测试版。尚未发布到 GitHub 或 npm。已使用真实 Key 完成一次 Flare 生图、保存及 MCP 预览验证；编辑、多参考图及跨平台客户端仍待真实验收。**

## 能做什么

| 工具 | 用途 |
| --- | --- |
| `image_generate` | 文生图，一次 1–4 张 |
| `image_edit` | 上传一张本地参考图并编辑 |
| `image_multi_reference` | 上传 2–10 张参考图，融合生成一张图片 |
| `image_batch_edit` | 最多 10 张图片逐张编辑，遇到失败停止并报告已完成文件 |
| `server_info` | 查看接口、默认模型和输出目录，不展示 Key，不调用上游 |

生图默认使用 `gpt-image-2.5-flare`；编辑类工具默认使用 `gpt-image-2.5-sunburst`。可通过工具的 `model` 参数或环境变量指定其他模型。模型名原样发送，不会因分辨率而自动切换。

返回结果包含保存文件的绝对路径、真实宽高和缩小预览。批量编辑返回文件列表；原图保持原始分辨率。是否显示内嵌预览由客户端决定。

上游不一定严格按请求尺寸返回图片。程序会在 `warnings` 中报告尺寸差异，并保留上游原图，不静默缩放。首次实测请求 1024×1024，实际返回 1254×1254。

## 环境要求

- Node.js 22.19.0 及以上，推荐 22/24 LTS 的最新补丁版本。
- 有图片模型权限和可用余额的 PdhAPI Key。
- 本地可写的图片输出目录。

本项目是 Node.js 实现，需要 Node.js 和依赖；不是单文件原生可执行程序。

## 从源码运行

获取本仓库后，在项目目录执行：

```sh
npm ci
node src/cli.js version
node src/cli.js --help
```

先准备密钥，选用以下一种方式：

1. 在启动 MCP 客户端的环境里设置 `PDHAPI_API_KEY`，然后完全退出并重新启动客户端。
2. 将 Key 保存在仓库以外的私有 UTF-8 文件中，文件内只有 Key，安装时通过 `--key-file` 指定该文件。推荐桌面客户端使用这种方式，避免无法继承环境变量。

不要把 Key 或密钥文件提交到 GitHub。不要使用带 Key 的命令行参数。本程序不会自动读取 `.env` 文件，`.env.example` 仅说明变量名称。

## 配置客户端

在项目目录选择对应命令。以下 `--key-file` 路径是示例，需要换成你自己的私有文件路径。

```sh
node src/cli.js install --client codex --key-file /absolute/path/to/private-key.txt
node src/cli.js install --client claude --key-file /absolute/path/to/private-key.txt
node src/cli.js install --client cursor --key-file /absolute/path/to/private-key.txt
```

Windows 示例：

```powershell
node src/cli.js install --client codex --key-file 'C:\Users\YourName\.pdhapi\api-key.txt'
```

安装器会合并 `pdhapi-image` 配置，保留其他 MCP 和设置，并在修改前生成完整备份。TOML/JSON 会重新序列化，原有注释或排版可能变化。安装后重新启动客户端。安装器只保存密钥文件路径，不复制密钥内容。

默认配置位置：

| 客户端 | 文件 |
| --- | --- |
| Codex | `~/.codex/config.toml`，支持 `CODEX_HOME` |
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |

Claude Desktop 使用不同的配置文件，可用 `--config` 指向其实际 JSON 配置。它未纳入本版实际客户端验收。

仅生成配置片段、不修改客户端配置：

```sh
node src/cli.js config --client codex
node src/cli.js config --client cursor
```

安装器登记当前 Node 和程序的绝对路径。安装后不要移动或删除项目；移动后重新运行安装器。

## 检查与使用

在相同密钥环境中运行：

```sh
node src/cli.js doctor
```

`doctor` 只检查本机配置和密钥是否可读取，不验证余额、权限或上游连通性。未配置可读密钥时退出码为 2。使用 `--key-file` 安装后，密钥路径保存在客户端配置中；独立运行 `doctor` 时仍需设置 `PDHAPI_API_KEY_FILE`，或者让客户端调用 `server_info`。

在 MCP 客户端中先调用 `server_info`，确认地址为 PdhAPI，再提出请求，例如：

> 用 PdhAPI 生成一张白色陶瓷杯的产品照片，1024×1024，保存到本地。

> 用 PdhAPI 编辑这张图片，把背景改成浅灰色，保持产品不变。参考图片路径是……

常用尺寸：`1024x1024`、`1536x1024`、`1024x1536`、`2048x1152`、`3840x2160`，也支持 `auto`。手动尺寸必须是 16 的倍数，每边最多 4096。工具允许填写不等于上游支持，具体尺寸和 `quality` 可用值受模型、渠道及账号权限影响。

主站在本版开发时公开列出了 `gpt-image-2`、`gpt-image-2-2k`、`gpt-image-2-4k`、`gpt-image-2.5`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`；实际可调用范围以自己的 Key 为准。

## 配置项

| 环境变量 | 默认值 / 用途 |
| --- | --- |
| `PDHAPI_API_KEY` | PdhAPI Key |
| `PDHAPI_API_KEY_FILE` | 包含 Key 的本地文件，优先级低于直接设置 Key |
| `PDHAPI_BASE_URL` | `https://pdhlzy.com`，也接受末尾带 `/v1` |
| `PDHAPI_MODEL` | `gpt-image-2.5-flare` |
| `PDHAPI_EDIT_MODEL` | `gpt-image-2.5-sunburst` |
| `PDHAPI_SAVE_DIR` | `~/Pictures/pdhapi-out` |
| `PDHAPI_INPUT_ROOT` | 可选的参考图根目录；未设置时可读取用户传入的本地图片路径 |
| `PDHAPI_DOWNLOAD_HOSTS` | 允许下载图片的额外精确域名，逗号分隔；默认仅接口主机 |
| `PDHAPI_TIMEOUT_SECONDS` | 单次调用超时，默认 300，范围 1–900 |

`response_format` 默认 `b64_json`，避免依赖图片链接的可达性。如果渠道只返回 URL，需将可信图片 CDN 的精确域名加入 `PDHAPI_DOWNLOAD_HOSTS`。下载只接受公开 HTTPS 地址，不携带 PdhAPI Key，不跟随重定向，拒绝私网、回环和 fake-IP。使用代理软件时需确保 CDN 正常解析到真实公网地址。

参考图只接受非动画 PNG、JPEG、WebP，单张最多 30 MiB、16 百万像素。输出使用随机文件名，不覆盖已有图片。单个服务进程内图片任务按队列串行执行；多个客户端启动的独立进程之间没有共享队列。

## 计费与故障

图片请求会消耗 PdhAPI 额度，批量编辑每张都可能单独计费。软件不硬编码价格，请以 [PdhAPI](https://pdhlzy.com) 模型广场和账户用量为准。

- **超时、502 或连接断开**：不会自动重发。请求可能已经到达上游，请先查用量，避免重复扣费。
- **401/403**：检查 Key 和账号权限；`insufficient_user_quota` 表示账户余额不足，增加令牌额度不能替代给账户充值。
- **429**：检查余额、频率或上游限流。
- **生成成功但下载失败**：可能已扣费；检查 CDN 配置，避免直接重新生成。
- **批量部分失败**：先查看 `completed` 和 `failed_index`，已完成文件保留，不会整批重跑。
- **客户端主动超时**：将客户端工具等待时间调大。安装器将 Codex 工具超时设为 900 秒；大批量任务可能更长，建议分批执行。

本版没有自动重试、自动模型切换、内置代理订阅、自动升级或主站配置修改功能。

## 开发和发布

```sh
npm ci
npm run check
npm test
npm pack
```

`npm pack` 生成 `pdhapi-image-mcp-0.1.0.tgz`。发布后用户可下载包再全局安装：

```sh
npm install -g ./pdhapi-image-mcp-0.1.0.tgz
pdhapi-image-mcp install --client codex --key-file /absolute/path/to/private-key.txt
```

目前尚未发布 npm 包，不要把 `npx pdhapi-image-mcp` 当成已经可用的安装方式。

GitHub Actions 包含 Windows/macOS/Linux 的 Node 22/24 测试配置。推送与 `package.json` 版本匹配的 `v*` 标签时，发布流程先测试，再创建 GitHub Release，附带 npm 安装包和 SHA256 校验文件。它不会自动发布到 npm。

发布前必须更新本页顶部状态，并完成自己的真实上游生图、改图和多参考图验收。当前本地验证范围见 [VALIDATION.md](VALIDATION.md)。

## 来源和许可证

功能设计参考 [micu-image-mcp](https://github.com/Subaru486desuwa/micu-image-mcp)，本项目独立实现，并未复制或改名分发该项目源码。参考说明见 [NOTICE.md](NOTICE.md)。本项目自己的源码采用 [MIT License](LICENSE)。
