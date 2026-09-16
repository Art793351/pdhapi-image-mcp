# PdhAPI 图片工具：用户配置

每个用户使用自己的 PdhAPI Key，调用从该 Key 所属账户扣费。安装包内没有共享 Key。模型权限、分组和账户余额仍由 PdhAPI 管理。

## 1. 安装

准备 Node.js 22.19.0 及以上版本，下载发布包后，在发布包所在目录执行：

```powershell
npm install -g .\pdhapi-image-mcp-0.1.0.tgz
```

macOS/Linux 使用同样命令，将文件路径写为 `./pdhapi-image-mcp-0.1.0.tgz`。

项目地址：[Art793351/pdhapi-image-mcp](https://github.com/Art793351/pdhapi-image-mcp)。请从 [Releases](https://github.com/Art793351/pdhapi-image-mcp/releases) 下载 `.tgz` 安装包；如果暂时没有发布包，可按仓库 README 从源码安装。尚未发布到 npm，不要直接使用 npm 包名安装。

## 2. 配置自己的 Key

推荐把 Key 放在本机私有 UTF-8 文本文件中，只包含 Key 一行，文件放在项目目录以外。随后用 `--key-file` 指向它。这个文件不要分享给其他用户或上传 GitHub。

Windows 示例，替换为自己的实际路径：

```powershell
pdhapi-image-mcp install --client codex --key-file 'C:\Users\YourName\.pdhapi\api-key.txt'
```

使用 Claude Code 或 Cursor 时，把 `codex` 换成 `claude` 或 `cursor`。安装器会自动找到对应配置文件、生成备份，并添加工具配置，不需要手工填写程序路径。

接口默认是 `https://pdhlzy.com`，不用更改。默认生图模型为 `gpt-image-2.5-flare`，默认改图模型为 `gpt-image-2.5-sunburst`。使用密钥文件时，程序只在调用时读取 Key，配置中记录的是文件路径。

另一种方式是在启动客户端之前设置用户环境变量 `PDHAPI_API_KEY`，然后运行 `pdhapi-image-mcp install --client codex`。桌面客户端必须重新启动才能继承新环境变量；密钥文件方式通常更容易排查。

## 3. 重启并验证

完全退出并重新打开客户端，让它调用 `server_info`，确认接口包含 `pdhlzy.com`。

再让客户端“使用 PdhAPI 生成一张白色陶瓷杯的产品照片，1024×1024”。请求会使用账户额度。默认输出目录是用户自己的 `Pictures/pdhapi-out`，成功时会返回图片文件路径和预览。

如果上游返回尺寸与请求不同，工具会提示尺寸差异并保留原图。请以结果里的真实宽高为准。

`server_info` 显示已配置密钥来源，不代表余额、模型权限或密钥内容已经验证；第一次实际请求才能验证调用权限。

## 常见情况

| 现象 | 处理方法 |
| --- | --- |
| `insufficient_user_quota` / account balance is insufficient | 给该 Key 所属账户充值；仅调大令牌额度不能解决账户余额不足 |
| API key has insufficient quota | 检查这个令牌本身的额度限制 |
| 模型列表可查，但生图失败 | 继续检查账户余额、模型权限和渠道状态，列表成功不等于出图成功 |
| 客户端找不到工具 | 重新运行对应客户端安装命令，再完全重启客户端 |
| 读不到密钥文件 | 检查路径、文件访问权限及内容是否只有 Key |
| 生成超时或下载失败 | 先查用量和已保存文件，不要连续重复生成 |

安装器不会改动用户的聊天模型或 PdhAPI 主站设置。各用户的 Key、图片和客户端配置留在各自电脑上；生图提示词和参考图会按请求发送到 PdhAPI 及其上游渠道。
