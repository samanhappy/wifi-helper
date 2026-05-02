# wifi-helper agent guide

## Project shape

- `wifi-helper` is a macOS-first desktop app built with **Tauri 2 + Vite + vanilla TypeScript**.
- Frontend code lives in `src/`.
- Rust/Tauri backend code lives in `src-tauri/`.
- Prefer linking to existing docs instead of duplicating them:
  - setup, local dev, and release overview: [`README.md`](./README.md)
  - Chinese project documentation: [`README.zh-CN.md`](./README.zh-CN.md)
  - release automation details: [`.github/workflows/release.yml`](./.github/workflows/release.yml)

## Start here

Inspect these files first before making changes:

1. `src/main.ts` — frontend state, polling, localization, browser-opening flow
2. `src-tauri/src/lib.rs` — `check_network_status` Tauri command and network probing logic
3. `src-tauri/tauri.conf.json` — Tauri build/dev wiring
4. `package.json` — supported pnpm scripts
5. `vite.config.ts` and `tsconfig.json` — frontend runtime and strict TypeScript settings

## Build and validation

- Install dependencies with `pnpm install`.
- Use `pnpm build` to validate TypeScript and build the frontend bundle.
- Use `pnpm tauri build` when changes affect the Rust command, Tauri config, packaging, or the frontend/backend integration.
- Use `pnpm tauri dev` for interactive app development.
- Use `pnpm release:check` before version or release workflow changes.
- Do not invent a test command: this repo currently has no automated test script in `package.json`.

## Architecture boundaries

- The frontend owns UI rendering, polling cadence, cooldown tracking, localization, and opening the default browser.
- The Rust backend owns Wi-Fi detection, SSID resolution, captive-portal probing, and the structured result returned to the frontend.
- The main IPC contract is the `check_network_status` command.
- When changing the command payload, keep the Rust `NetworkCheckResult` and the TypeScript `NetworkCheckResult` interface in sync.
- Rust uses `serde(rename_all = "camelCase")`, so new fields should continue matching the frontend naming convention.

## Repo-specific conventions

- This app is intentionally **macOS-first**. Do not generalize platform behavior unless the task explicitly requires it.
- Wi-Fi hardware-port matching is fragile on macOS. Preserve support for `Wi-Fi`, `WiFi`, and `AirPort`, and be careful with exact matching around `Hardware Port: Wi-Fi`.
- SSID lookup uses a fallback chain. Prefer preserving the current order:
  1. `ipconfig getsummary <device>`
  2. sanitize redacted or empty values
  3. `networksetup -getairportnetwork <device>` / preferred-network fallback
- Captive-portal detection relies on short-timeout HTTP probes with redirects disabled:
  - redirects usually mean captive portal
  - HTTP `204` or the expected success body mean connected
  - unexpected HTML often means captive portal
- Frontend auto-open behavior is intentionally throttled. If you change it, update the UI copy and logic together:
  - poll interval: `15s`
  - required consecutive captive hits: `2`
  - auto-open cooldown: `5 minutes`

## Editing guardrails

- Avoid editing generated or build-output folders unless the task is specifically about them:
  - `dist/`
  - `node_modules/`
  - `src-tauri/target/`
- Prefer editing source files rather than generated artifacts under `src-tauri/gen/` unless the change is explicitly about generated Tauri schema output.
- Keep TypeScript compatible with the current strict compiler settings in `tsconfig.json`.
- Keep changes focused; this repo is small and follows straightforward entrypoint-based structure rather than heavy abstraction.
