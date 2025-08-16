/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
import { BASE_URL } from "../../../stores/ApiClient";
import { getIsElectronDetails } from "../../../utils/browser";
import { isPathValid, openInExplorer } from "../../../utils/fileExplorer";

type OSInfo = { platform: string; release: string; arch: string };
type VersionsInfo = {
  python?: string | null;
  nodetool_core?: string | null;
  nodetool_base?: string | null;
  cuda?: string | null;
  gpu_name?: string | null;
  vram_total_gb?: string | null;
  driver_version?: string | null;
};
type PathsInfo = {
  settings_path: string;
  secrets_path: string;
  data_dir: string;
  core_logs_dir: string;
  core_log_file: string;
  core_main_log_file?: string;
  ollama_models_dir: string;
  huggingface_cache_dir: string;
  electron_user_data: string;
  electron_log_file: string;
  electron_logs_dir: string;
  electron_main_log_file?: string;
};

type OllamaBasePathResponse = {
  path: string;
};

type HuggingFaceBasePathResponse = {
  path: string;
};
type SystemInfoResponse = {
  os: OSInfo;
  versions: VersionsInfo;
  paths: PathsInfo;
};

type HealthCheck = {
  id: string;
  status: "ok" | "warn" | "error";
  details?: string | null;
  fix_hint?: string | null;
};
type HealthResponse = {
  checks: HealthCheck[];
  summary: { ok: number; warn: number; error: number };
};

const systemTabStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    ".section": {
      display: "flex",
      flexDirection: "column",
      gap: ".5rem",
      marginBottom: "0.75rem"
    },
    ".row": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      flexWrap: "wrap"
    },
    ".label": {
      width: "220px",
      minWidth: "220px",
      color: theme.vars.palette.grey[300]
    },
    ".value": {
      fontFamily: "var(--fontFamilyMonospace)",
      color: theme.vars.palette.grey[100],
      wordBreak: "break-all",
      flex: 1
    },
    ".path-actions": {
      display: "flex",
      alignItems: "center",
      gap: ".25rem"
    },
    ".status": {
      display: "flex",
      alignItems: "center",
      gap: ".5rem",
      padding: ".25rem 0"
    }
  });

function StatusIcon({ status }: { status: HealthCheck["status"] }) {
  const theme = useTheme();
  if (status === "ok")
    return <CheckCircleIcon sx={{ color: theme.vars.palette.success.main }} />;
  if (status === "warn")
    return <WarningAmberIcon sx={{ color: theme.vars.palette.warning.main }} />;
  return <ErrorIcon sx={{ color: theme.vars.palette.error.main }} />;
}

export default function SystemTab() {
  const theme = useTheme();
  const [info, setInfo] = useState<SystemInfoResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { isElectron } = getIsElectronDetails();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [infoRes, healthRes] = await Promise.all([
          fetch(`${BASE_URL}/api/system/`, {
            headers: { Accept: "application/json" }
          }),
          fetch(`${BASE_URL}/api/system/health`, {
            headers: { Accept: "application/json" }
          })
        ]);

        if (!infoRes.ok) {
          throw new Error(
            `Failed to load system info: ${infoRes.status} ${infoRes.statusText}`
          );
        }
        if (!healthRes.ok) {
          throw new Error(
            `Failed to load health info: ${healthRes.status} ${healthRes.statusText}`
          );
        }

        const infoJson = (await infoRes.json()) as SystemInfoResponse;
        const healthJson = (await healthRes.json()) as HealthResponse;

        // Fallback: fetch Ollama/HF paths from existing endpoints if missing
        try {
          const updates: Partial<PathsInfo> = {};
          if (!infoJson.paths.ollama_models_dir) {
            const res = await fetch(`${BASE_URL}/api/models/ollama_base_path`, {
              headers: { Accept: "application/json" }
            });
            if (res.ok) {
              const data = (await res.json()) as OllamaBasePathResponse;
              if (data?.path) {
                updates.ollama_models_dir = data.path;
              }
            }
          }
          if (!infoJson.paths.huggingface_cache_dir) {
            const res = await fetch(
              `${BASE_URL}/api/models/huggingface_base_path`,
              {
                headers: { Accept: "application/json" }
              }
            );
            if (res.ok) {
              const data = (await res.json()) as HuggingFaceBasePathResponse;
              if (data?.path) {
                updates.huggingface_cache_dir = data.path;
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            infoJson.paths = { ...infoJson.paths, ...updates };
          }
        } catch (e) {
          // ignore fallback errors
        }
        if (!cancelled) {
          setInfo(infoJson);
          setHealth(healthJson);
        }
      } catch (e) {
        console.error("Failed to load system info/health:", e);
        // You could set an error state here to show user-friendly error messages
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyAllText = useMemo(() => {
    if (!info) return "";
    const lines: string[] = [];
    lines.push(`OS: ${info.os.platform} ${info.os.release} (${info.os.arch})`);
    lines.push(
      `Versions: python=${info.versions.python ?? ""}, core=${
        info.versions.nodetool_core ?? ""
      }, base=${info.versions.nodetool_base ?? ""}, cuda=${
        info.versions.cuda ?? ""
      }`
    );
    if (
      info.versions.gpu_name ||
      info.versions.vram_total_gb ||
      info.versions.driver_version
    ) {
      lines.push(
        `GPU: ${info.versions.gpu_name ?? "N/A"}, VRAM=${
          info.versions.vram_total_gb
            ? info.versions.vram_total_gb + "GB"
            : "N/A"
        }, driver=${info.versions.driver_version ?? "N/A"}`
      );
    }
    lines.push("Paths:");
    const p = info.paths;
    lines.push(`  settings_path: ${p.settings_path}`);
    lines.push(`  secrets_path: ${p.secrets_path}`);
    lines.push(`  data_dir: ${p.data_dir}`);
    const chatLogs = isElectron ? p.electron_logs_dir : p.core_logs_dir;
    lines.push(`  chat_logs_folder: ${chatLogs}`);
    // Show only if backend provides it to avoid guessing
    if (!isElectron && p.core_main_log_file) {
      lines.push(`  core_main_log_file: ${p.core_main_log_file}`);
    }
    lines.push(`  ollama_models_dir: ${p.ollama_models_dir}`);
    lines.push(`  huggingface_cache_dir: ${p.huggingface_cache_dir}`);
    if (isElectron) {
      lines.push(`  electron_user_data: ${p.electron_user_data}`);
      lines.push(`  electron_log_file: ${p.electron_log_file}`);
      lines.push(`  electron_logs_dir: ${p.electron_logs_dir}`);
      if (p.electron_main_log_file)
        lines.push(`  electron_main_log_file: ${p.electron_main_log_file}`);
    }
    if (health) {
      lines.push("Health Summary:");
      lines.push(
        `  ok=${health.summary.ok} warn=${health.summary.warn} error=${health.summary.error}`
      );
      lines.push("Health Checks:");
      for (const c of health.checks) {
        lines.push(
          `  ${c.id}: ${c.status}${c.details ? ` (${c.details})` : ""}`
        );
      }
    }
    return lines.join("\n");
  }, [info, health, isElectron]);

  // Build paths list unconditionally to keep hooks order stable
  const paths: Array<{ label: string; value: string }> = useMemo(() => {
    if (!info) return [];
    const list: Array<{ label: string; value: string }> = [
      { label: "Settings", value: info.paths.settings_path },
      { label: "Secrets", value: info.paths.secrets_path },
      { label: "Data Dir", value: info.paths.data_dir },
      {
        label: "Chat Logs Folder",
        value: isElectron
          ? info.paths.electron_logs_dir
          : info.paths.core_logs_dir
      },
      ...(!isElectron && info.paths.core_main_log_file
        ? [
            {
              label: "Main Log",
              value: info.paths.core_main_log_file
            }
          ]
        : []),
      { label: "Ollama Models", value: info.paths.ollama_models_dir },
      { label: "HuggingFace Cache", value: info.paths.huggingface_cache_dir }
    ];
    if (isElectron) {
      list.push(
        { label: "Electron UserData", value: info.paths.electron_user_data },
        { label: "Electron Log File", value: info.paths.electron_log_file },
        { label: "Electron Logs Dir", value: info.paths.electron_logs_dir },
        ...(info.paths.electron_main_log_file
          ? [
              {
                label: "Electron Main Log",
                value: info.paths.electron_main_log_file
              }
            ]
          : [])
      );
    }
    return list;
  }, [info, isElectron]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading system info…</Typography>
      </Box>
    );
  }

  if (!info) {
    return <Typography variant="body2">No system info available.</Typography>;
  }

  return (
    <div css={systemTabStyles(theme)}>
      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Typography variant="h3">System</Typography>
          <div className="path-actions">
            <CopyToClipboardButton
              title="Copy all system info"
              textToCopy={copyAllText}
              tooltipPlacement="left"
              size="small"
            />
          </div>
        </div>
        <Typography variant="body2" color={theme.vars.palette.grey[300]}>
          OS: {info.os.platform} {info.os.release} ({info.os.arch})
        </Typography>
        <Typography variant="body2" color={theme.vars.palette.grey[300]}>
          Versions: python={info.versions.python ?? ""} core=
          {info.versions.nodetool_core ?? ""} base=
          {info.versions.nodetool_base ?? ""} cuda=
          {info.versions.cuda ?? ""}
        </Typography>
        {(info.versions.gpu_name ||
          info.versions.vram_total_gb ||
          info.versions.driver_version) && (
          <Typography variant="body2" color={theme.vars.palette.grey[300]}>
            GPU: {info.versions.gpu_name ?? "N/A"}, VRAM=
            {info.versions.vram_total_gb
              ? info.versions.vram_total_gb + "GB"
              : "N/A"}
            , driver=
            {info.versions.driver_version ?? "N/A"}
          </Typography>
        )}
      </div>

      <Divider />

      <div className="section">
        <Typography variant="h4">Paths</Typography>
        {paths.map(({ label, value }) => (
          <div className="row" key={label}>
            <Typography className="label" variant="body2">
              {label}
            </Typography>
            <Typography className="value" variant="body2">
              {value || "-"}
            </Typography>
            <div className="path-actions">
              <CopyToClipboardButton
                title={`Copy ${label}`}
                textToCopy={value ?? ""}
                tooltipPlacement="top"
              />
              <Button
                size="small"
                variant="outlined"
                onClick={() => openInExplorer(value)}
                disabled={!isPathValid(value)}
                startIcon={<OpenInNewIcon sx={{ fontSize: "1rem" }} />}
                sx={{
                  borderColor: theme.vars.palette.grey[600],
                  color: theme.vars.palette.grey[200]
                }}
              >
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>

      {health && (
        <>
          <Divider />
          <div className="section">
            <Typography variant="h4">Health</Typography>
            <Typography variant="body2" color={theme.vars.palette.grey[300]}>
              Summary: ok={health.summary.ok} warn={health.summary.warn} error=
              {health.summary.error}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {health.checks.map((c) => (
                <div className="status" key={c.id}>
                  <StatusIcon status={c.status} />
                  <Box
                    sx={{ display: "flex", flexDirection: "column", flex: 1 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" sx={{ minWidth: 220 }}>
                        {c.id}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {c.details || ""}
                      </Typography>
                    </Box>
                    {c.fix_hint && (
                      <Typography
                        variant="body2"
                        color={theme.vars.palette.grey[400]}
                        sx={{ paddingLeft: 0, marginTop: 0.25 }}
                      >
                        {c.fix_hint}
                      </Typography>
                    )}
                  </Box>
                </div>
              ))}
            </Box>
          </div>
        </>
      )}
    </div>
  );
}
