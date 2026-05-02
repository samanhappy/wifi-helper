# WiFi Helper

[English README](./README.md)

`WiFi Helper` 是一个基于 **Tauri 2 + Vanilla TypeScript** 的 macOS 桌面应用，用来检测“已经连接 WiFi 但无法正常联网”的场景，并在识别到 **captive portal**（门户登录页）后，尝试用默认浏览器打开登录页，帮助用户尽快恢复上网。

当前项目优先面向 **macOS 公共 WiFi** 使用场景，尤其适合像星巴克这类经常需要网页认证的热点环境。

## 功能特性

- 自动检测当前是否连接到 WiFi
- 自动探测网络是否被 captive portal 拦截
- 检测到门户登录页时可自动打开默认浏览器
- 内置轮询、连续命中判断和冷却时间，避免重复弹出浏览器
- 提供手动“立即检测”和“打开登录页”入口
- 应用界面支持 **简体中文和英文** 切换

## 技术栈

- **前端**：Vanilla TypeScript + Vite
- **桌面壳**：Tauri 2
- **后端**：Rust
- **打开系统浏览器**：`@tauri-apps/plugin-opener`
- **联网探测**：`reqwest`

## 工作原理

应用启动后会定时执行以下流程：

1. 在 macOS 上检查当前活动网络接口是否为 WiFi
2. 尝试获取当前 SSID
3. 对多个探测地址发起短超时 HTTP 请求
4. 根据以下信号判断网络状态：
   - 正常联网
   - captive portal
   - 离线 / 异常
5. 当连续多次命中 captive portal，且不在冷却时间内时，自动打开默认浏览器

当前使用的探测地址：

- `http://captive.apple.com/hotspot-detect.html`
- `http://connectivitycheck.gstatic.com/generate_204`

## 开发环境要求

建议环境：

- macOS
- Node.js 18+
- `pnpm`
- Rust stable
- Xcode Command Line Tools

如果还没有安装 Tauri 所需环境，可参考：

- <https://tauri.app/start/prerequisites/>

## 本地开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm tauri dev
```

## 构建

构建前端资源：

```bash
pnpm build
```

构建桌面应用发布包：

```bash
pnpm tauri build
```

构建完成后，产物通常位于：

- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

在 macOS 下常见产物包括：

- `.app`
- `.dmg`

## 对外正式发布（GitHub Releases）

项目现已支持通过 **GitHub Actions** 自动执行正式发布。

### 自动发布触发方式

当你推送一个符合语义化版本格式的 Git 标签时，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions 会自动：

1. 安装 `pnpm`、Node.js 和 Rust
2. 校验以下版本号是否一致：
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
3. 构建 Tauri release 包
4. 生成并上传发布产物到 GitHub Release

### 自动上传的产物

- `WiFi Helper_v<version>_macOS_aarch64.dmg`
- `WiFi Helper_v<version>_macOS_aarch64.zip`

其中 `.zip` 内包含 `.app`，适合直接下载解压；`.dmg` 更适合对外分发安装。

### 正式发布前建议检查

发布前先在本地执行：

```bash
pnpm release:check
pnpm tauri build
```

### GitHub 仓库要求

为了让自动发布正常工作，仓库需要开启 GitHub Actions，并允许工作流写入 `contents` 权限来创建 Release。

现在的发布工作流要求提供有效的 **Developer ID Application** 证书和 notarization 凭据，这样生成出来的 `.app` / `.dmg` 才能通过 macOS Gatekeeper 检查。

需要配置的 GitHub Actions secrets：

- `APPLE_CERTIFICATE`：导出的 **Developer ID Application** `.p12` 证书内容（base64）
- `APPLE_CERTIFICATE_PASSWORD`：导出 `.p12` 时设置的密码
- `KEYCHAIN_PASSWORD`：CI 临时 keychain 使用的密码

notarization 二选一：

- App Store Connect API：
   - `APPLE_API_KEY`：`.p8` 私钥内容，或其 base64 形式
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER`
- 或 Apple ID：
   - `APPLE_ID`
   - `APPLE_PASSWORD`（app-specific password）
   - `APPLE_TEAM_ID`

工作流会先把证书导入临时 keychain，解析出 `Developer ID Application` 签名身份，然后让 `pnpm tauri build` 完成签名和 notarization，并在发布前用 `codesign`、`spctl`、`stapler` 校验产物。

如果这些 secrets 没有配置，工作流会直接失败，而不是继续上传一个可能被 macOS 判定为“已损坏”的未签名安装包。

如果后续还要把发布流程做得更完整，建议继续补充：

- 自动更新元数据
- Release Notes 模板

## 已知限制

- 当前实现优先面向 macOS
- 某些 macOS 环境会对当前 SSID 做脱敏，项目已尽量做回退处理，但并非所有系统环境都能 100% 获取到原始 SSID
- 公共 WiFi 的门户实现差异较大，个别网络可能仍需额外适配

## 推荐的 VS Code 开发环境

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

本项目采用 [MIT License](./LICENSE)。
