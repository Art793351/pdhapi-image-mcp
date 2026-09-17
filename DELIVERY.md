# 项目文档交付清单

**项目名称：** pdhapi-image-mcp  
**版本：** 0.1.0  
**仓库地址：** https://github.com/Art793351/pdhapi-image-mcp  
**交付日期：** 2026-09-17

---

## 一、核心文档

### 1.1 用户文档

| 文档 | 说明 | 用途 |
|------|------|------|
| **README.md** | 项目主文档 | 项目概述、快速开始、完整配置说明、API参考 |
| **USER_GUIDE.md** | 用户指南 | 面向最终用户的配置和使用说明 |
| **VALIDATION.md** | 验证文档 | 网络安全、输入验证、错误处理等机制说明 |
| **NOTICE.md** | 注意事项 | Sharp库安装说明和平台兼容性提醒 |

### 1.2 法律文档

| 文档 | 说明 |
|------|------|
| **LICENSE** | MIT许可证 |

---

## 二、配置文件

| 文件 | 说明 |
|------|------|
| **package.json** | npm包配置，包含依赖、脚本、入口点 |
| **.env.example** | 环境变量配置示例 |

---

## 三、安装脚本

| 脚本 | 平台 | 说明 |
|------|------|------|
| **scripts/install.sh** | macOS/Linux | 一键安装脚本，支持SHA256验证 |
| **scripts/install.ps1** | Windows | PowerShell安装脚本，支持SHA256验证 |

**使用方式：**
```bash
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/Art793351/pdhapi-image-mcp/main/scripts/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/Art793351/pdhapi-image-mcp/main/scripts/install.ps1 | iex
```

---

## 四、源代码结构

```
src/
├── cli.js          # 命令行入口，MCP服务器启动
├── server.js       # MCP协议服务器实现
├── api.js          # PdhAPI客户端封装
├── config.js       # 配置加载和验证
├── keychain.js     # 系统凭据管理器集成
└── install.js      # 交互式安装向导
```

---

## 五、测试文件

```
test/
├── core.test.js    # 配置、keychain、API核心功能测试
├── http.test.js    # HTTP客户端和网络安全测试
└── mcp.test.js     # MCP协议集成测试
```

---

## 六、CI/CD配置

| 文件 | 说明 |
|------|------|
| **.github/workflows/ci.yml** | 持续集成，跨平台测试（Ubuntu/Windows/macOS × Node 22/24） |
| **.github/workflows/release.yml** | 自动发布流程，生成.tgz包和SHA256校验文件 |

**工作流触发：**
- CI：每次push和PR时运行
- Release：推送`v*`标签时触发

---

## 七、核心功能特性

### 7.1 安全特性
- ✅ 系统凭据管理器集成（macOS Keychain、Windows Credential Manager、Linux Secret Service）
- ✅ 网络安全验证（本地IP拦截、SSRF防护）
- ✅ 输入验证和错误处理
- ✅ SHA256校验确保安装包完整性

### 7.2 MCP工具清单
1. **generate_image** - 文生图
2. **edit_image** - 图片编辑（修改提示词、尺寸、数量）
3. **read_image** - 读取图片信息（尺寸、格式、prompt）

### 7.3 支持的客户端
- Codex CLI
- Codex Desktop
- Cursor
- 其他兼容MCP 1.30.0+的客户端

---

## 八、环境要求

| 组件 | 版本要求 |
|------|----------|
| **Node.js** | >=22.19.0 |
| **npm** | 内置于Node.js |
| **系统** | macOS/Linux/Windows |

---

## 九、关键依赖

```json
{
  "@modelcontextprotocol/sdk": "1.30.0",
  "sharp": "0.35.4",
  "undici": "8.10.2",
  "zod": "4.6.5",
  "@iarna/toml": "2.2.5",
  "ipaddr.js": "2.5.0"
}
```

---

## 十、快速验证

### 10.1 安装验证
```bash
pdhapi-image-mcp --version
# 输出: 0.1.0
```

### 10.2 配置验证
```bash
pdhapi-image-mcp install
# 按提示完成交互式配置
```

### 10.3 功能测试
参考USER_GUIDE.md中的"使用和测试"章节

---

## 十一、在线资源

| 资源 | 地址 |
|------|------|
| **GitHub仓库** | https://github.com/Art793351/pdhapi-image-mcp |
| **发布页面** | https://github.com/Art793351/pdhapi-image-mcp/releases |
| **Actions状态** | https://github.com/Art793351/pdhapi-image-mcp/actions |
| **问题反馈** | https://github.com/Art793351/pdhapi-image-mcp/issues |

---

## 十二、版本历史

### v0.1.0 (2026-09-17) - 预发布
- ✅ 完整MCP工具实现
- ✅ 系统凭据管理器支持
- ✅ 一键安装脚本（macOS/Linux/Windows）
- ✅ 跨平台CI/CD流程
- ✅ 完整文档和用户指南

---

**交付状态：** ✅ 已完成  
**代码已推送至GitHub：** https://github.com/Art793351/pdhapi-image-mcp  
**标签：** v0.1.0（已触发GitHub Actions自动发布）
