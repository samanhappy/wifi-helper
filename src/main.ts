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

type Locale = "zh-CN" | "en";

interface LocaleMessages {
  htmlLang: string;
  title: string;
  eyebrow: string;
  heroTitle: string;
  heroCopy: string;
  networkSectionTitle: string;
  ssidLabel: string;
  checkedAtLabel: string;
  probeUrlLabel: string;
  portalSectionTitle: string;
  reasonSectionTitle: string;
  checkButton: string;
  checkingButton: string;
  portalButton: string;
  statusLabels: Record<NetworkStatus | "idle", string>;
  statusSummaries: Record<NetworkStatus, string>;
  emptySsid: string;
  emptyCheckedAt: string;
  emptyPortalUrl: string;
  emptyProbeUrl: string;
  emptyReason: string;
  emptyActionMessage: string;
  checkingAction: string;
  rawReasonFallback: string;
  manualCheckDone: string;
  autoCheckDone: string;
  autoOpenedPortal: string;
  manualOpenedPortal: string;
  captiveHitProgress: (count: number, required: number) => string;
  portalCooldown: (minutes: number) => string;
  portalOpenFailed: (message: string) => string;
  manualPortalOpenFailed: (message: string) => string;
  checkFailed: string;
}

const STORAGE_LOCALE_KEY = "wifi-helper.locale";

const messages: Record<Locale, LocaleMessages> = {
  "zh-CN": {
    htmlLang: "zh-CN",
    title: "WiFi 助手",
    eyebrow: "macOS captive portal assistant",
    heroTitle: "WiFi 助手",
    heroCopy:
      "自动检测“已经连上 WiFi 但无法上网”的情况；如果识别到门户登录页，就尝试帮你在默认浏览器中打开它。",
    networkSectionTitle: "当前网络",
    ssidLabel: "WiFi 名称",
    checkedAtLabel: "最近检测",
    probeUrlLabel: "探测地址",
    portalSectionTitle: "登录入口",
    reasonSectionTitle: "诊断说明",
    checkButton: "立即检测",
    checkingButton: "检测中...",
    portalButton: "打开登录页",
    statusLabels: {
      idle: "等待首次检测",
      connected: "网络正常",
      captivePortal: "需要网页登录",
      offline: "无法联网",
      notOnWifi: "未连接 WiFi",
      error: "检测异常",
    },
    statusSummaries: {
      connected: "已经能正常访问互联网，浏览器今天先不用加班。",
      captivePortal: "检测到门户登录页，满足条件时会自动帮你打开浏览器。",
      offline: "当前像是断网或探测失败，没有看到明确的登录入口。",
      notOnWifi: "还没有连接到 WiFi，因此不会尝试拉起登录页。",
      error: "检测流程遇到异常，请查看下面的诊断信息。",
    },
    emptySsid: "未检测",
    emptyCheckedAt: "尚未检测",
    emptyPortalUrl: "还没有可打开的门户链接。",
    emptyProbeUrl: "—",
    emptyReason: "检测尚未开始。首次检测完成后，这里会显示详细诊断信息。",
    emptyActionMessage:
      "后台会自动轮询，并在满足条件时只打开一次浏览器，避免“连环弹窗”。",
    checkingAction: "后台检测中。",
    rawReasonFallback: "没有额外诊断信息。",
    manualCheckDone: "已完成手动检测。",
    autoCheckDone: "已完成后台检测，等待下一轮轮询。",
    autoOpenedPortal: "已自动在默认浏览器中打开登录页。",
    manualOpenedPortal: "已手动在默认浏览器中打开登录页。",
    captiveHitProgress: (count, required) =>
      `已识别到门户登录页，连续命中 ${count}/${required} 次后会自动打开。`,
    portalCooldown: (minutes) =>
      `已识别到门户登录页，但仍在冷却时间内；约 ${minutes} 分钟后才会再次自动打开。`,
    portalOpenFailed: (message) => `检测到登录页，但打开浏览器失败：${message}`,
    manualPortalOpenFailed: (message) => `打开登录页失败：${message}`,
    checkFailed: "检测失败了，请稍后重试。",
  },
  en: {
    htmlLang: "en",
    title: "WiFi Helper",
    eyebrow: "macOS captive portal assistant",
    heroTitle: "WiFi Helper",
    heroCopy:
      "Detect when your Mac is connected to WiFi but cannot reach the internet, and open the captive portal login page in your default browser when needed.",
    networkSectionTitle: "Current network",
    ssidLabel: "WiFi name",
    checkedAtLabel: "Last checked",
    probeUrlLabel: "Probe URL",
    portalSectionTitle: "Login portal",
    reasonSectionTitle: "Diagnostics",
    checkButton: "Check now",
    checkingButton: "Checking...",
    portalButton: "Open login page",
    statusLabels: {
      idle: "Waiting for first check",
      connected: "Connected",
      captivePortal: "Login required",
      offline: "Offline",
      notOnWifi: "Not on WiFi",
      error: "Check failed",
    },
    statusSummaries: {
      connected: "Internet access looks healthy — your browser can stay off the clock.",
      captivePortal: "A captive portal was detected. The app can open the login page for you.",
      offline: "This looks like an offline or probe failure state, and no clear login page was found.",
      notOnWifi: "You are not currently connected to WiFi, so no portal will be opened.",
      error: "The check hit an error. See the diagnostics below for details.",
    },
    emptySsid: "Not checked yet",
    emptyCheckedAt: "Not checked yet",
    emptyPortalUrl: "No portal URL is available yet.",
    emptyProbeUrl: "—",
    emptyReason:
      "The check has not started yet. Detailed diagnostic information will appear here after the first run.",
    emptyActionMessage:
      "Background polling will run automatically and open the browser only once when the conditions are met.",
    checkingAction: "Background check in progress.",
    rawReasonFallback: "No extra diagnostic details are available.",
    manualCheckDone: "Manual check completed.",
    autoCheckDone: "Background check completed. Waiting for the next polling cycle.",
    autoOpenedPortal: "Opened the login page automatically in your default browser.",
    manualOpenedPortal: "Opened the login page manually in your default browser.",
    captiveHitProgress: (count, required) =>
      `Captive portal detected. It will open automatically after ${count}/${required} consecutive hits.`,
    portalCooldown: (minutes) =>
      `Captive portal detected, but the cooldown is still active. It can auto-open again in about ${minutes} minute(s).`,
    portalOpenFailed: (message) =>
      `A login page was detected, but opening the browser failed: ${message}`,
    manualPortalOpenFailed: (message) => `Failed to open the login page: ${message}`,
    checkFailed: "The check failed. Please try again in a moment.",
  },
};

const POLL_INTERVAL_MS = 15_000;
const AUTO_OPEN_COOLDOWN_MS = 5 * 60_000;
const REQUIRED_CAPTIVE_HITS = 2;

let currentLocale: Locale = detectInitialLocale();
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
let eyebrowTextEl: HTMLElement;
let heroTitleEl: HTMLElement;
let heroCopyEl: HTMLElement;
let networkSectionTitleEl: HTMLElement;
let ssidLabelEl: HTMLElement;
let checkedAtLabelEl: HTMLElement;
let probeUrlLabelEl: HTMLElement;
let portalSectionTitleEl: HTMLElement;
let reasonSectionTitleEl: HTMLElement;
let portalButtonLabelEl: HTMLElement;
let langZhButtonEl: HTMLButtonElement;
let langEnButtonEl: HTMLButtonElement;

function detectInitialLocale(): Locale {
  const storedLocale = window.localStorage.getItem(STORAGE_LOCALE_KEY);

  if (storedLocale === "zh-CN" || storedLocale === "en") {
    return storedLocale;
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function t(): LocaleMessages {
  return messages[currentLocale];
}

function syncStaticTexts(): void {
  const localeMessages = t();

  document.documentElement.lang = localeMessages.htmlLang;
  document.title = localeMessages.title;
  eyebrowTextEl.textContent = localeMessages.eyebrow;
  heroTitleEl.textContent = localeMessages.heroTitle;
  heroCopyEl.textContent = localeMessages.heroCopy;
  networkSectionTitleEl.textContent = localeMessages.networkSectionTitle;
  ssidLabelEl.textContent = localeMessages.ssidLabel;
  checkedAtLabelEl.textContent = localeMessages.checkedAtLabel;
  probeUrlLabelEl.textContent = localeMessages.probeUrlLabel;
  portalSectionTitleEl.textContent = localeMessages.portalSectionTitle;
  reasonSectionTitleEl.textContent = localeMessages.reasonSectionTitle;
  portalButtonLabelEl.textContent = localeMessages.portalButton;
  checkButtonEl.textContent = isChecking
    ? localeMessages.checkingButton
    : localeMessages.checkButton;
  langZhButtonEl.classList.toggle("is-active", currentLocale === "zh-CN");
  langEnButtonEl.classList.toggle("is-active", currentLocale === "en");
}

function setLocale(locale: Locale): void {
  currentLocale = locale;
  window.localStorage.setItem(STORAGE_LOCALE_KEY, locale);
  syncStaticTexts();
  render(currentResult);
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function statusLabel(status: NetworkStatus): string {
  return t().statusLabels[status];
}

function statusSummary(result: NetworkCheckResult): string {
  return t().statusSummaries[result.status];
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
  const localeMessages = t();

  if (!unixSeconds) {
    return localeMessages.emptyCheckedAt;
  }

  return new Date(unixSeconds * 1000).toLocaleString(localeMessages.htmlLang, {
    hour12: false,
  });
}

function render(result: NetworkCheckResult | null, actionMessage?: string): void {
  const localeMessages = t();

  if (!result) {
    statusBadgeEl.textContent = localeMessages.statusLabels.idle;
    statusBadgeEl.dataset.tone = statusTone("idle");
    statusSummaryEl.textContent = localeMessages.statusLabels.idle;
    ssidValueEl.textContent = localeMessages.emptySsid;
    checkedAtValueEl.textContent = localeMessages.emptyCheckedAt;
    probeUrlValueEl.textContent = localeMessages.emptyProbeUrl;
    portalUrlValueEl.textContent = localeMessages.emptyPortalUrl;
    portalButtonEl.disabled = true;
    reasonValueEl.textContent = localeMessages.emptyReason;
    actionMessageEl.textContent =
      actionMessage ?? localeMessages.emptyActionMessage;
    return;
  }

  statusBadgeEl.textContent = statusLabel(result.status);
  statusBadgeEl.dataset.tone = statusTone(result.status);
  statusSummaryEl.textContent = statusSummary(result);
  ssidValueEl.textContent = result.ssid ?? localeMessages.statusLabels.notOnWifi;
  checkedAtValueEl.textContent = formatTimestamp(result.checkedAt);
  probeUrlValueEl.textContent = result.probeUrl ?? localeMessages.emptyProbeUrl;
  portalUrlValueEl.textContent = result.portalUrl ?? localeMessages.emptyPortalUrl;
  portalButtonEl.disabled = !result.portalUrl;
  reasonValueEl.textContent = result.reason ?? localeMessages.rawReasonFallback;
  actionMessageEl.textContent = actionMessage ?? localeMessages.checkingAction;
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
  const localeMessages = t();

  await openUrl(url);

  if (source === "auto") {
    lastAutoOpenedAt = Date.now();
    return localeMessages.autoOpenedPortal;
  }

  return localeMessages.manualOpenedPortal;
}

async function runCheck(trigger: "auto" | "manual"): Promise<void> {
  if (isChecking) {
    return;
  }

  isChecking = true;
  checkButtonEl.disabled = true;
  checkButtonEl.textContent = t().checkingButton;

  try {
    const localeMessages = t();
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
        ? localeMessages.manualCheckDone
        : localeMessages.autoCheckDone;

    if (result.status === "captivePortal" && result.portalUrl) {
      try {
        if (trigger === "manual") {
          actionMessage = await openPortal(result.portalUrl, "manual");
        } else if (canAutoOpen(result)) {
          actionMessage = await openPortal(result.portalUrl, "auto");
        } else if (consecutiveCaptiveHits < REQUIRED_CAPTIVE_HITS) {
          actionMessage = localeMessages.captiveHitProgress(
            consecutiveCaptiveHits,
            REQUIRED_CAPTIVE_HITS,
          );
        } else {
          const cooldownLeftMs = Math.max(
            0,
            AUTO_OPEN_COOLDOWN_MS - (Date.now() - lastAutoOpenedAt),
          );
          const minutesLeft = Math.ceil(cooldownLeftMs / 60_000);
          actionMessage = localeMessages.portalCooldown(minutesLeft);
        }
      } catch (error) {
        actionMessage = localeMessages.portalOpenFailed(
          error instanceof Error ? error.message : String(error),
        );
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
    render(fallback, t().checkFailed);
  } finally {
    isChecking = false;
    checkButtonEl.disabled = false;
    checkButtonEl.textContent = t().checkButton;
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
  eyebrowTextEl = requireElement<HTMLElement>("#eyebrow-text");
  heroTitleEl = requireElement<HTMLElement>("#hero-title");
  heroCopyEl = requireElement<HTMLElement>("#hero-copy");
  statusBadgeEl = requireElement<HTMLElement>("#status-badge");
  statusSummaryEl = requireElement<HTMLElement>("#status-summary");
  networkSectionTitleEl = requireElement<HTMLElement>("#network-section-title");
  ssidLabelEl = requireElement<HTMLElement>("#ssid-label");
  checkedAtLabelEl = requireElement<HTMLElement>("#checked-at-label");
  probeUrlLabelEl = requireElement<HTMLElement>("#probe-url-label");
  portalSectionTitleEl = requireElement<HTMLElement>("#portal-section-title");
  ssidValueEl = requireElement<HTMLElement>("#ssid-value");
  checkedAtValueEl = requireElement<HTMLElement>("#checked-at-value");
  probeUrlValueEl = requireElement<HTMLElement>("#probe-url-value");
  portalUrlValueEl = requireElement<HTMLElement>("#portal-url-value");
  actionMessageEl = requireElement<HTMLElement>("#action-message");
  reasonSectionTitleEl = requireElement<HTMLElement>("#reason-section-title");
  reasonValueEl = requireElement<HTMLElement>("#reason-value");
  checkButtonEl = requireElement<HTMLButtonElement>("#check-button");
  portalButtonEl = requireElement<HTMLButtonElement>("#portal-button");
  portalButtonLabelEl = requireElement<HTMLElement>("#portal-button-label");
  langZhButtonEl = requireElement<HTMLButtonElement>("#lang-zh");
  langEnButtonEl = requireElement<HTMLButtonElement>("#lang-en");

  syncStaticTexts();

  langZhButtonEl.addEventListener("click", () => {
    setLocale("zh-CN");
  });

  langEnButtonEl.addEventListener("click", () => {
    setLocale("en");
  });

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
        t().manualPortalOpenFailed(error instanceof Error ? error.message : String(error)),
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
