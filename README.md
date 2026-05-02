# WiFi Helper

`WiFi Helper` 是一个基于 **Tauri 2 + Vanilla TypeScript** 的 macOS 桌面应用，用来检测“已经连接 Wi‑Fi 但无法正常联网”的场景，并在识别到 **captive portal**（门户登录页）后，尝试用默认浏览器打开登录页，帮助用户尽快恢复上网。

当前项目优先面向 **macOS 公共 Wi‑Fi** 使用场景，尤其适合像星巴克这类经常需要网页认证的热点环境。

## 功能特性

- 自动检测当前是否连接到 Wi‑Fi
- 自动探测网络是否被 captive portal 拦截
- 检测到门户登录页时可自动打开默认浏览器
- 内置轮询、连续命中判断和冷却时间，避免重复弹出浏览器
- 提供手动“立即检测”和“打开登录页”入口

## 技术栈

- **前端**：Vanilla TypeScript + Vite
- **桌面壳**：Tauri 2
- **后端**：Rust
- **打开系统浏览器**：`@tauri-apps/plugin-opener`
- **联网探测**：`reqwest`

## 工作原理

应用启动后会定时执行以下流程：

1. 在 macOS 上检查当前活动网络接口是否为 Wi‑Fi
2. 尝试获取当前 SSID
3. 对多个探测地址发起短超时 HTTP 请求
4. 根据以下信号判断网络状态：
	- 正常联网
	- captive portal
	- 离线/异常
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

## 发布说明

当前项目已具备**本地发布**能力，也就是可以直接构建出可分发的 macOS 应用包。

推荐的发布流程：

1. 更新版本号：
	- `package.json`
	- `src-tauri/Cargo.toml`
	- `src-tauri/tauri.conf.json`
2. 执行：`pnpm tauri build`
3. 从 `src-tauri/target/release/bundle/` 获取发布产物
4. 将 `.dmg` 或 `.app` 分发给测试用户

如果后续需要进一步发布到：

- GitHub Releases
- 官网下载页
- Sparkle/Tauri Updater 自动更新

可以在当前基础上继续补充签名、更新源和 CI 发布流程。

## 已知限制

- 当前实现优先面向 macOS
- 某些 macOS 环境会对当前 SSID 做脱敏，项目已尽量做回退处理，但并非所有系统环境都能 100% 获取到原始 SSID
- 公共 Wi‑Fi 的门户实现差异较大，个别网络可能仍需额外适配

## 推荐的 VS Code 开发环境

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

本项目采用 [MIT License](./LICENSE)。
