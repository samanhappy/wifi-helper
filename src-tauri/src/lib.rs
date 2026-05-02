use reqwest::{header, redirect::Policy, Client, Url};
use serde::Serialize;
use std::{
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const PROBE_TIMEOUT_SECS: u64 = 5;
const PROBE_ENDPOINTS: [(&str, Option<&str>); 2] = [
    ("http://captive.apple.com/hotspot-detect.html", Some("Success")),
    ("http://connectivitycheck.gstatic.com/generate_204", None),
];

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum NetworkStatus {
    Connected,
    CaptivePortal,
    Offline,
    NotOnWifi,
    Error,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkCheckResult {
    status: NetworkStatus,
    ssid: Option<String>,
    portal_url: Option<String>,
    probe_url: Option<String>,
    checked_at: u64,
    reason: Option<String>,
    auto_open_recommended: bool,
}

#[derive(Debug)]
enum ProbeOutcome {
    Connected {
        probe_url: String,
        reason: String,
    },
    CaptivePortal {
        portal_url: String,
        probe_url: String,
        reason: String,
    },
    Offline {
        reason: String,
    },
}

#[tauri::command]
async fn check_network_status() -> NetworkCheckResult {
    let checked_at = current_timestamp();

    let ssid = match current_wifi_ssid() {
        Ok(ssid) => ssid,
        Err(error) => {
            return NetworkCheckResult {
                status: NetworkStatus::Error,
                ssid: None,
                portal_url: None,
                probe_url: None,
                checked_at,
                reason: Some(format!("Failed to inspect WiFi state: {error}")),
                auto_open_recommended: false,
            };
        }
    };

    let Some(ssid) = ssid else {
        return NetworkCheckResult {
            status: NetworkStatus::NotOnWifi,
            ssid: None,
            portal_url: None,
            probe_url: None,
            checked_at,
            reason: Some("No active WiFi connection detected on macOS.".into()),
            auto_open_recommended: false,
        };
    };

    match detect_connectivity().await {
        Ok(ProbeOutcome::Connected { probe_url, reason }) => NetworkCheckResult {
            status: NetworkStatus::Connected,
            ssid: Some(ssid),
            portal_url: None,
            probe_url: Some(probe_url),
            checked_at,
            reason: Some(reason),
            auto_open_recommended: false,
        },
        Ok(ProbeOutcome::CaptivePortal {
            portal_url,
            probe_url,
            reason,
        }) => NetworkCheckResult {
            status: NetworkStatus::CaptivePortal,
            ssid: Some(ssid),
            portal_url: Some(portal_url),
            probe_url: Some(probe_url),
            checked_at,
            reason: Some(reason),
            auto_open_recommended: true,
        },
        Ok(ProbeOutcome::Offline { reason }) => NetworkCheckResult {
            status: NetworkStatus::Offline,
            ssid: Some(ssid),
            portal_url: None,
            probe_url: None,
            checked_at,
            reason: Some(reason),
            auto_open_recommended: false,
        },
        Err(error) => NetworkCheckResult {
            status: NetworkStatus::Error,
            ssid: Some(ssid),
            portal_url: None,
            probe_url: None,
            checked_at,
            reason: Some(error),
            auto_open_recommended: false,
        },
    }
}

async fn detect_connectivity() -> Result<ProbeOutcome, String> {
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(PROBE_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let mut offline_reasons = Vec::new();

    for (probe_url, expected_body) in PROBE_ENDPOINTS {
        match probe_endpoint(&client, probe_url, expected_body).await {
            Ok(outcome @ ProbeOutcome::Connected { .. })
            | Ok(outcome @ ProbeOutcome::CaptivePortal { .. }) => return Ok(outcome),
            Ok(ProbeOutcome::Offline { reason }) => offline_reasons.push(reason),
            Err(error) => offline_reasons.push(error),
        }
    }

    Ok(ProbeOutcome::Offline {
        reason: if offline_reasons.is_empty() {
            "All probe endpoints failed without a detailed reason.".into()
        } else {
            offline_reasons.join(" | ")
        },
    })
}

async fn probe_endpoint(
    client: &Client,
    probe_url: &str,
    expected_body: Option<&str>,
) -> Result<ProbeOutcome, String> {
    let response = client
        .get(probe_url)
        .header(
            header::USER_AGENT,
            "wifi-helper/0.1 (Tauri captive portal detector)",
        )
        .send()
        .await
        .map_err(|error| format!("Probe {probe_url} failed: {error}"))?;

    let status = response.status();
    let location = response
        .headers()
        .get(header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| normalize_portal_url(probe_url, value));
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();

    if status.is_redirection() {
        let portal_url = location.unwrap_or_else(|| probe_url.to_string());
        return Ok(ProbeOutcome::CaptivePortal {
            portal_url,
            probe_url: probe_url.to_string(),
            reason: format!(
                "Probe endpoint redirected with HTTP {}, likely a captive portal.",
                status.as_u16()
            ),
        });
    }

    if status.as_u16() == 204 {
        return Ok(ProbeOutcome::Connected {
            probe_url: probe_url.to_string(),
            reason: format!("Probe returned HTTP {}.", status.as_u16()),
        });
    }

    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read probe response from {probe_url}: {error}"))?;
    let trimmed_body = body.trim();

    if status.is_success() {
        if let Some(expected_body) = expected_body {
            if trimmed_body.contains(expected_body) {
                return Ok(ProbeOutcome::Connected {
                    probe_url: probe_url.to_string(),
                    reason: format!("Probe matched expected body marker `{expected_body}`."),
                });
            }
        }

        let looks_like_html = content_type.contains("text/html")
            || trimmed_body.starts_with("<!DOCTYPE html")
            || trimmed_body.starts_with("<html")
            || trimmed_body.contains("<form")
            || trimmed_body.contains("password")
            || trimmed_body.contains("login");

        if looks_like_html {
            return Ok(ProbeOutcome::CaptivePortal {
                portal_url: location.unwrap_or_else(|| probe_url.to_string()),
                probe_url: probe_url.to_string(),
                reason: "Probe returned HTML content instead of expected connectivity response."
                    .into(),
            });
        }

        return Ok(ProbeOutcome::Offline {
            reason: format!(
                "Probe {probe_url} returned HTTP {} but no known connectivity marker.",
                status.as_u16()
            ),
        });
    }

    Ok(ProbeOutcome::Offline {
        reason: format!(
            "Probe {probe_url} returned HTTP {}.",
            status.as_u16()
        ),
    })
}

fn current_wifi_ssid() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let Some(device) = find_wifi_device()? else {
            return Ok(None);
        };

        if let Some(ssid) = wifi_ssid_from_ipconfig(device.as_str())? {
            return Ok(Some(ssid));
        }

        let output = Command::new("networksetup")
            .args(["-getairportnetwork", device.as_str()])
            .output()
            .map_err(|error| format!("Failed to execute networksetup: {error}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            if stdout.contains("You are not associated with an AirPort network")
                || stderr.contains("You are not associated with an AirPort network")
            {
                return Ok(None);
            }

            return Err(format!(
                "networksetup -getairportnetwork failed: {}{}{}",
                output.status,
                if stdout.is_empty() { "" } else { " | stdout: " },
                if stdout.is_empty() {
                    stderr
                } else if stderr.is_empty() {
                    stdout
                } else {
                    format!("{stdout} | stderr: {stderr}")
                }
            ));
        }

        if let Some((_, ssid)) = stdout.split_once(": ") {
            if let Some(ssid) = sanitize_ssid(ssid) {
                return Ok(Some(ssid));
            }
        }

        if stdout.contains("You are not associated with an AirPort network") {
            return preferred_wifi_name(device.as_str());
        }

        return preferred_wifi_name(device.as_str());
    }

    #[allow(unreachable_code)]
    Ok(None)
}

fn find_wifi_device() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("networksetup")
            .arg("-listallhardwareports")
            .output()
            .map_err(|error| format!("Failed to list hardware ports: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "networksetup -listallhardwareports failed with status {}",
                output.status
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        for block in stdout.split("\n\n") {
            let mut saw_wifi_port = false;
            let mut device = None;

            for line in block.lines() {
                let line = line.trim();

                if line == "Hardware Port: Wi-Fi"
                    || line == "Hardware Port: WiFi"
                    || line == "Hardware Port: AirPort"
                {
                    saw_wifi_port = true;
                }

                if let Some((_, value)) = line.split_once("Device: ") {
                    device = Some(value.trim().to_string());
                }
            }

            if saw_wifi_port {
                return Ok(device);
            }
        }

        return Ok(None);
    }

    #[allow(unreachable_code)]
    Ok(None)
}

fn wifi_ssid_from_ipconfig(device: &str) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ipconfig")
            .args(["getsummary", device])
            .output()
            .map_err(|error| format!("Failed to execute ipconfig: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "ipconfig getsummary {device} failed with status {}",
                output.status
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut interface_type = None::<String>;
        let mut link_status_active = None::<bool>;
        let mut ssid = None::<String>;

        for line in stdout.lines() {
            let line = line.trim();

            if let Some((key, value)) = line.split_once(" : ") {
                match key.trim() {
                    "InterfaceType" => interface_type = Some(value.trim().to_string()),
                    "LinkStatusActive" => {
                        link_status_active = Some(value.trim().eq_ignore_ascii_case("TRUE"))
                    }
                    "SSID" => ssid = Some(value.trim().to_string()),
                    _ => {}
                }
            }
        }

        let is_wifi = interface_type
            .as_deref()
            .map(|value| value.eq_ignore_ascii_case("WiFi"))
            .unwrap_or(false);
        let is_active = link_status_active.unwrap_or(false);

        if is_wifi && is_active {
            if let Some(ssid) = ssid {
                if let Some(ssid) = sanitize_ssid(&ssid) {
                    return Ok(Some(ssid));
                }
            }

            return preferred_wifi_name(device);
        }

        return Ok(None);
    }

    #[allow(unreachable_code)]
    Ok(None)
}

fn preferred_wifi_name(device: &str) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("networksetup")
            .args(["-listpreferredwirelessnetworks", device])
            .output()
            .map_err(|error| format!("Failed to list preferred WiFi networks: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "networksetup -listpreferredwirelessnetworks {device} failed with status {}",
                output.status
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        for line in stdout.lines().skip(1) {
            if let Some(ssid) = sanitize_ssid(line) {
                return Ok(Some(ssid));
            }
        }

        return Ok(Some("Hidden WiFi".to_string()));
    }

    #[allow(unreachable_code)]
    Ok(None)
}

fn sanitize_ssid(value: &str) -> Option<String> {
    let ssid = value.trim();

    if ssid.is_empty() || ssid == "<redacted>" {
        return None;
    }

    Some(ssid.to_string())
}

fn normalize_portal_url(base: &str, candidate: &str) -> Option<String> {
    if let Ok(parsed) = Url::parse(candidate) {
        return Some(parsed.to_string());
    }

    let base = Url::parse(base).ok()?;
    base.join(candidate).ok().map(|url| url.to_string())
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![check_network_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
