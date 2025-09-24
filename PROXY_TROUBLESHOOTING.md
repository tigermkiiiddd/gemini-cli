# Gemini CLI 代理配置故障排除指南

## 问题概述

当使用 `gemini --proxy` 命令时，可能会遇到各种代理相关的连接错误。本指南将帮助您诊断和解决这些问题。

## 常见错误及解决方案

### 1. TLS 连接错误

**错误信息：**
```
Error: Client network socket disconnected before secure TLS connection was established
```

**原因：** 使用了错误的代理协议（HTTPS 而不是 HTTP）

**解决方案：**
- ❌ 错误用法：`gemini --proxy https://127.0.0.1:7890`
- ✅ 正确用法：`gemini --proxy http://127.0.0.1:7890`

大多数代理服务器（如 Clash、V2Ray、Shadowsocks 等）使用 HTTP 协议进行代理连接，即使它们能够代理 HTTPS 流量。

### 2. 代理服务器连接失败

**错误信息：**
```
ECONNREFUSED: Connection refused
```

**诊断步骤：**

1. **检查代理服务器是否运行：**
   ```powershell
   # 检查端口是否开放
   Test-NetConnection -ComputerName 127.0.0.1 -Port 7890
   ```

2. **测试代理连接：**
   ```powershell
   # 使用 PowerShell 测试代理
   Invoke-WebRequest -Uri "https://www.google.com" -Proxy "http://127.0.0.1:7890"
   ```

3. **检查代理软件配置：**
   - 确认代理软件（Clash、V2Ray 等）正在运行
   - 确认监听端口正确（通常是 7890、1080、8080 等）
   - 确认允许来自本地的连接

### 3. 代理认证问题

如果您的代理需要用户名和密码认证：

```bash
# 带认证的代理格式
gemini --proxy http://username:password@127.0.0.1:7890
```

## 代理配置最佳实践

### 1. 常用代理软件端口

| 软件 | 默认 HTTP 代理端口 | 默认 SOCKS 代理端口 |
|------|-------------------|--------------------|
| Clash | 7890 | 7891 |
| V2Ray | 1087 | 1080 |
| Shadowsocks | 1087 | 1080 |
| Proxifier | 8080 | 1080 |

### 2. 环境变量配置

除了使用 `--proxy` 参数，您也可以设置环境变量：

```powershell
# PowerShell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
gemini --prompt "test"
```

```bash
# Bash/Zsh
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
gemini --prompt "test"
```

### 3. 代理绕过设置

如果需要绕过某些地址的代理：

```powershell
$env:NO_PROXY = "localhost,127.0.0.1,*.local"
```

## 调试技巧

### 1. 启用详细日志

```bash
# 启用 Node.js 调试日志
DEBUG=* gemini --proxy http://127.0.0.1:7890 --prompt "test"
```

### 2. 检查网络连接

```powershell
# 检查到 Google API 的连接
Test-NetConnection -ComputerName generativelanguage.googleapis.com -Port 443

# 通过代理测试连接
Invoke-WebRequest -Uri "https://generativelanguage.googleapis.com" -Proxy "http://127.0.0.1:7890" -Method HEAD
```

### 3. 验证代理工作状态

```powershell
# 获取当前 IP（不使用代理）
Invoke-WebRequest -Uri "https://httpbin.org/ip" | Select-Object -ExpandProperty Content

# 获取当前 IP（使用代理）
Invoke-WebRequest -Uri "https://httpbin.org/ip" -Proxy "http://127.0.0.1:7890" | Select-Object -ExpandProperty Content
```

如果两次请求返回不同的 IP 地址，说明代理工作正常。

## 常见问题 FAQ

**Q: 为什么我的代理软件显示正在运行，但 gemini 仍然连接失败？**

A: 检查以下几点：
1. 代理软件是否允许来自本地的连接
2. 防火墙是否阻止了连接
3. 代理端口是否正确
4. 是否使用了正确的协议（HTTP 而不是 HTTPS）

**Q: 我可以使用 SOCKS 代理吗？**

A: 目前 gemini CLI 主要支持 HTTP 代理。如果您只有 SOCKS 代理，可以考虑使用工具将 SOCKS 代理转换为 HTTP 代理。

**Q: 如何知道我的代理是否支持 HTTPS 流量？**

A: 大多数现代代理软件都支持 HTTPS 流量代理。您可以通过上面提到的测试命令来验证。

## 技术支持

如果按照本指南操作后仍然遇到问题，请提供以下信息：

1. 完整的错误信息
2. 使用的代理软件和版本
3. 代理配置（隐藏敏感信息）
4. 操作系统版本
5. Node.js 版本

这将帮助我们更好地诊断和解决问题。