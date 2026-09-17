# PdhAPI 图片工具：用户配置

每个用户使用自己的 PdhAPI Key，调用从该 Key 所属账户扣费。安装包内没有共享 Key。模型权限、分组和账户余额仍由 PdhAPI 管理。

## 1. 安装

**macOS / Linux（一键安装）：**

```sh
PDHAPI_INSTALL_VERSION=0.1.0 curl -fsSL https://github.com/Art793351/pdhapi-image-mcp/releases/download/v0.1.0/install.sh | sh
```

**Windows（一键安装，PowerShell）：**

```powershell
$env:PDHAPI_INSTALL_VERSION='0.1.0'; Invoke-RestMethod https://github.com/Art793351/pdhapi-image-mcp/releases/download/v0.1.0/install.ps1 | Invoke-Expression
```

两种脚本都会自动验证 SHA256 校验值、检查 Node.js 版本、全局安装包，并打印下一步操作提示。

**手动安装（适用于离线或自定义环境）：**

准备 Node.js 22.19.0 及以上版本，从 [Releases](https://github.com/Art793351/pdhapi-image-mcp/releases) 下载 `.tgz` 安装包，在下载目录执行：

```powershell
npm install -g .\pdhapi-image-mcp-0.1.0.tgz
```

macOS/Linux 使用同样命令，路径写为 `./pdhapi-image-mcp-0.1.0.tgz`。

## 2. 配置自己的 Key

有三种方式配置 Key，按推荐度排序：

### 方式一：系统凭据管理器（推荐）

macOS 使用 Keychain，Windows 使用 Credential Manager，Linux 使用 Secret Service（需要 `secret-tool`）。Key 不以明文写入任何配置文件：

```sh
# 保存 Key（从终端交互输入，不会出现在命令历史）
pdhapi-image-mcp keychain set

# 验证可读取
pdhapi-image-mcp keychain get

# 安装时指定使用凭据管理器
pdhapi-image-mcp install --client codex --keychain
```

### 方式二：私有密钥文件

把 Key 存入本机私有 UTF-8 文本文件，只含 Key 一行，放在项目目录以外：

Windows 示例：

```powershell
pdhapi-image-mcp install --client codex --key-file 'C:\Users\YourName\.pdhapi\api-key.txt'
```

macOS/Linux 示例：

```sh
pdhapi-image-mcp install --client codex --key-file ~/.pdhapi/api-key.txt
```

### 方式三：环境变量

在启动客户端前设置 `PDHAPI_API_KEY`，再运行 `pdhapi-image-mcp install --client codex`。桌面客户端必须完全重启才能继承新变量；密钥文件或凭据管理器方式通常更容易排查。

使用 Claude Code 或 Cursor 时，把 `codex` 换成 `claude` 或 `cursor`。安装器会自动找到对应配置文件、生成备份，不需要手工填写程序路径。

接口默认是 `https://pdhlzy.com`，不用更改。默认生图模型为 `gpt-image-2.5-flare`，默认改图模型为 `gpt-image-2.5-sunburst`。

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
