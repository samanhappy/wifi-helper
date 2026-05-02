# WiFi Helper

[中文文档](./README.zh-CN.md)

`WiFi Helper` is a **Tauri 2 + Vanilla TypeScript** macOS desktop app that detects when your Mac is connected to WiFi but cannot reach the internet, then helps open the captive portal login page in your default browser.

The project currently focuses on **public WiFi networks on macOS**, especially places like Starbucks where web-based authentication is common.

## Features

- Detects whether the current connection is using WiFi
- Probes for captive portal interception automatically
- Opens the login page in the default browser when a portal is detected
- Includes polling, consecutive-hit checks, and cooldown protection to avoid repetitive browser popups
- Provides manual actions for “Check now” and “Open login page”
- Supports **English and Simplified Chinese** in the app UI

## Tech Stack

- **Frontend**: Vanilla TypeScript + Vite
- **Desktop shell**: Tauri 2
- **Backend**: Rust
- **Open system browser**: `@tauri-apps/plugin-opener`
- **Connectivity probing**: `reqwest`

## How It Works

The app periodically runs the following flow:

1. Check whether the active macOS network interface is WiFi
2. Try to obtain the current SSID
3. Send short-timeout HTTP probes to known connectivity endpoints
4. Classify the result as one of the following:
   - connected
   - captive portal
   - offline / error
5. If a captive portal is detected multiple times in a row and the cooldown window has expired, open the default browser automatically

Current probe endpoints:

- `http://captive.apple.com/hotspot-detect.html`
- `http://connectivitycheck.gstatic.com/generate_204`

## Requirements

Recommended environment:

- macOS
- Node.js 18+
- `pnpm`
- Rust stable
- Xcode Command Line Tools

If you still need to prepare the Tauri prerequisites, see:

- <https://tauri.app/start/prerequisites/>

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the development app:

```bash
pnpm tauri dev
```

## Build

Build frontend assets:

```bash
pnpm build
```

Build the desktop release bundle:

```bash
pnpm tauri build
```

Release artifacts are typically generated in:

- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

Common macOS outputs include:

- `.app`
- `.dmg`

## Public Release via GitHub Releases

This project supports **automated public releases with GitHub Actions**.

### Triggering a Release

Push a semantic version tag such as:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow will automatically:

1. Install `pnpm`, Node.js, and Rust
2. Verify version consistency across:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
3. Build the Tauri release bundle
4. Upload artifacts to GitHub Releases

### Uploaded Assets

- `WiFi Helper_v<version>_macOS_aarch64.dmg`
- `WiFi Helper_v<version>_macOS_aarch64.zip`

The `.zip` contains the `.app` bundle for direct extraction, while the `.dmg` is more convenient for external distribution.

### Recommended Pre-release Checks

Before pushing a release tag, run:

```bash
pnpm release:check
pnpm tauri build
```

### GitHub Repository Requirements

To make automated releases work, the repository must have GitHub Actions enabled and allow the workflow to write `contents` permissions for creating releases.

The release workflow now expects a valid **Developer ID Application** certificate and notarization credentials so the generated `.app` / `.dmg` can pass macOS Gatekeeper checks.

Required GitHub Actions secrets:

- `APPLE_CERTIFICATE`: base64-encoded exported `.p12` certificate for **Developer ID Application**
- `APPLE_CERTIFICATE_PASSWORD`: export password used for the `.p12`
- `KEYCHAIN_PASSWORD`: temporary keychain password used in CI

Use **one** notarization method:

- App Store Connect API:
   - `APPLE_API_KEY`: `.p8` private key content or its base64 form
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER`
- or Apple ID:
   - `APPLE_ID`
   - `APPLE_PASSWORD` (app-specific password)
   - `APPLE_TEAM_ID`

The workflow imports the certificate into a temporary keychain, resolves the `Developer ID Application` signing identity, lets `pnpm tauri build` sign and notarize the bundle, and then validates the generated `.app` with `codesign`, `spctl`, and `stapler` before publishing release assets.

If these secrets are missing, the workflow now fails early instead of uploading an unsigned build that macOS may report as damaged.

For a more production-ready macOS distribution flow, consider adding:

- updater metadata
- a release notes template

## Limitations

- The current implementation is macOS-first
- Some macOS environments redact the current SSID; the project includes fallback handling, but cannot guarantee the original SSID in every environment
- Public WiFi captive portals vary widely, so a few networks may still need extra adaptation

## Recommended VS Code Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

This project is licensed under the [MIT License](./LICENSE).
