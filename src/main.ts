import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type NetworkStatus =
  | "connected"
  | "captivePortal"
  | "offline"
  | "notOnWifi"
  | "error";

interface NetworkCheckResult {
  status: NetworkStatus;
  ssid: string | null;
  portalUrl: string | null;
  probeUrl: string | null;
  checkedAt: number;
  reason: string | null;
  autoOpenRecommended: boolean;
}

const POLL_INTERVAL_MS = 15_000;
const AUTO_OPEN_COOLDOWN_MS = 5 * 60_000;
const REQUIRED_CAPTIVE_HITS = 2;

let currentResult: NetworkCheckResult | null = null;
let consecutiveCaptiveHits = 0;
let lastAutoOpenedAt = 0;
let pollingHandle: number | null = null;
let isChecking = false;

let statusBadgeEl: HTMLElement;
let statusSummaryEl: HTMLElement;
let ssidValueEl: HTMLElement;
let checkedAtValueEl: HTMLElement;
let probeUrlValueEl: HTMLElement;
let portalUrlValueEl: HTMLElement;
let actionMessageEl: HTMLElement;
let reasonValueEl: HTMLElement;
let checkButtonEl: HTMLButtonElement;
let portalButtonEl: HTMLButtonElement;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function statusLabel(status: NetworkStatus): string {
  switch (status) {
    case "connected":
      return "网络正常";
    case "captivePortal":
      return "需要网页登录";
    case "offline":
      return "无法联网";
    case "notOnWifi":
      return "未连接 Wi‑Fi";
    case "error":
      return "检测异常";
  }
}

function statusSummary(result: NetworkCheckResult): string {
  switch (result.status) {
    case "connected":
      return "已经能正常访问互联网，浏览器今天先不用加班。";
    case "captivePortal":
      return "检测到门户登录页，满足条件时会自动帮你打开浏览器。";
    case "offline":
      return "当前像是断网或探测失败，没有看到明确的登录入口。";
    case "notOnWifi":
      return "还没有连接到 Wi‑Fi，因此不会尝试拉起登录页。";
    case "error":
      return "检测流程遇到异常，请查看下面的诊断信息。";
  }
}

function statusTone(status: NetworkStatus | "idle"): string {
  switch (status) {
    case "connected":
      return "success";
    case "captivePortal":
      return "warning";
    case "offline":
    case "error":
      return "danger";
    case "notOnWifi":
      return "muted";
    case "idle":
      return "idle";
  }
}

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) {
    return "尚未检测";
  }

  return new Date(unixSeconds * 1000).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function render(result: NetworkCheckResult | null, actionMessage?: string): void {
  if (!result) {
    statusBadgeEl.textContent = "等待首次检测";
    statusBadgeEl.dataset.tone = statusTone("idle");
    statusSummaryEl.textContent = "应用启动后会自动开始检测。";
    ssidValueEl.textContent = "未检测";
    checkedAtValueEl.textContent = "尚未检测";
    probeUrlValueEl.textContent = "—";
    portalUrlValueEl.textContent = "还没有可打开的门户链接。";
    portalButtonEl.disabled = true;
    reasonValueEl.textContent = "检测尚未开始。首次检测完成后，这里会显示详细诊断信息。";
    actionMessageEl.textContent =
      actionMessage ?? "后台会自动轮询，并在满足条件时只打开一次浏览器，避免“连环弹窗”。";
    return;
  }

  statusBadgeEl.textContent = statusLabel(result.status);
  statusBadgeEl.dataset.tone = statusTone(result.status);
  statusSummaryEl.textContent = statusSummary(result);
  ssidValueEl.textContent = result.ssid ?? "未连接 Wi‑Fi";
  checkedAtValueEl.textContent = formatTimestamp(result.checkedAt);
  probeUrlValueEl.textContent = result.probeUrl ?? "—";
  portalUrlValueEl.textContent = result.portalUrl ?? "没有拿到明确的门户地址。";
  portalButtonEl.disabled = !result.portalUrl;
  reasonValueEl.textContent = result.reason ?? "没有额外诊断信息。";
  actionMessageEl.textContent = actionMessage ?? "后台检测中。";
}

function canAutoOpen(result: NetworkCheckResult): boolean {
  if (
    result.status !== "captivePortal" ||
    !result.portalUrl ||
    !result.autoOpenRecommended
  ) {
    return false;
  }

  if (consecutiveCaptiveHits < REQUIRED_CAPTIVE_HITS) {
    return false;
  }

  return Date.now() - lastAutoOpenedAt >= AUTO_OPEN_COOLDOWN_MS;
}

async function openPortal(url: string, source: "auto" | "manual"): Promise<string> {
  await openUrl(url);

  if (source === "auto") {
    lastAutoOpenedAt = Date.now();
    return "已自动在默认浏览器中打开登录页。";
  }

  return "已手动在默认浏览器中打开登录页。";
}

async function runCheck(trigger: "auto" | "manual"): Promise<void> {
  if (isChecking) {
    return;
  }

  isChecking = true;
  checkButtonEl.disabled = true;
  checkButtonEl.textContent = "检测中...";

  try {
    const previousStatus = currentResult?.status;
    const previousPortalUrl = currentResult?.portalUrl;
    const result = await invoke<NetworkCheckResult>("check_network_status");

    if (
      result.status === "captivePortal" &&
      result.portalUrl &&
      previousStatus === "captivePortal" &&
      previousPortalUrl === result.portalUrl
    ) {
      consecutiveCaptiveHits += 1;
    } else if (result.status === "captivePortal" && result.portalUrl) {
      consecutiveCaptiveHits = 1;
    } else {
      consecutiveCaptiveHits = 0;
    }

    currentResult = result;

    let actionMessage =
      trigger === "manual"
        ? "已完成手动检测。"
        : "已完成后台检测，等待下一轮轮询。";

    if (result.status === "captivePortal" && result.portalUrl) {
      try {
        if (trigger === "manual") {
          actionMessage = await openPortal(result.portalUrl, "manual");
        } else if (canAutoOpen(result)) {
          actionMessage = await openPortal(result.portalUrl, "auto");
        } else if (consecutiveCaptiveHits < REQUIRED_CAPTIVE_HITS) {
          actionMessage = `已识别到门户登录页，连续命中 ${consecutiveCaptiveHits}/${REQUIRED_CAPTIVE_HITS} 次后会自动打开。`;
        } else {
          const cooldownLeftMs = Math.max(
            0,
            AUTO_OPEN_COOLDOWN_MS - (Date.now() - lastAutoOpenedAt),
          );
          const minutesLeft = Math.ceil(cooldownLeftMs / 60_000);
          actionMessage = `已识别到门户登录页，但仍在冷却时间内；约 ${minutesLeft} 分钟后才会再次自动打开。`;
        }
      } catch (error) {
        actionMessage = `检测到登录页，但打开浏览器失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }

    render(result, actionMessage);
  } catch (error) {
    const fallback: NetworkCheckResult = {
      status: "error",
      ssid: currentResult?.ssid ?? null,
      portalUrl: currentResult?.portalUrl ?? null,
      probeUrl: currentResult?.probeUrl ?? null,
      checkedAt: Math.floor(Date.now() / 1000),
      reason: error instanceof Error ? error.message : String(error),
      autoOpenRecommended: false,
    };

    currentResult = fallback;
    consecutiveCaptiveHits = 0;
    render(fallback, "检测失败了，请稍后重试。");
  } finally {
    isChecking = false;
    checkButtonEl.disabled = false;
    checkButtonEl.textContent = "立即检测";
  }
}

function startPolling(): void {
  if (pollingHandle !== null) {
    window.clearInterval(pollingHandle);
  }

  pollingHandle = window.setInterval(() => {
    void runCheck("auto");
  }, POLL_INTERVAL_MS);
}

window.addEventListener("DOMContentLoaded", () => {
  statusBadgeEl = requireElement<HTMLElement>("#status-badge");
  statusSummaryEl = requireElement<HTMLElement>("#status-summary");
  ssidValueEl = requireElement<HTMLElement>("#ssid-value");
  checkedAtValueEl = requireElement<HTMLElement>("#checked-at-value");
  probeUrlValueEl = requireElement<HTMLElement>("#probe-url-value");
  portalUrlValueEl = requireElement<HTMLElement>("#portal-url-value");
  actionMessageEl = requireElement<HTMLElement>("#action-message");
  reasonValueEl = requireElement<HTMLElement>("#reason-value");
  checkButtonEl = requireElement<HTMLButtonElement>("#check-button");
  portalButtonEl = requireElement<HTMLButtonElement>("#portal-button");

  checkButtonEl.addEventListener("click", () => {
    void runCheck("manual");
  });

  portalButtonEl.addEventListener("click", async () => {
    if (!currentResult?.portalUrl) {
      return;
    }

    try {
      const message = await openPortal(currentResult.portalUrl, "manual");
      render(currentResult, message);
    } catch (error) {
      render(
        currentResult,
        `打开登录页失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  render(null);
  void runCheck("auto");
  startPolling();
});

window.addEventListener("beforeunload", () => {
  if (pollingHandle !== null) {
    window.clearInterval(pollingHandle);
  }
});
