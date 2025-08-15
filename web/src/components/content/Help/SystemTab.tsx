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
import { BASE_URL, authHeader } from "../../../stores/ApiClient";
import { getIsElectronDetails } from "../../../utils/browser";

type OSInfo = { platform: string; release: string; arch: string };
type VersionsInfo = {
  python?: string | null;
  nodetool_core?: string | null;
  nodetool_base?: string | null;
  cuda?: string | null;
};
type PathsInfo = {
  settings_path: string;
  secrets_path: string;
  data_dir: string;
  core_logs_dir: string;
  core_log_file: string;
  ollama_models_dir: string;
  huggingface_cache_dir: string;
  electron_user_data: string;
  electron_log_file: string;
  electron_logs_dir: string;
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

async function openInExplorer(path: string) {
  try {
    if (!path) return;
    console.log("Opening in explorer:", path);
    const headers = await authHeader();
    const res = await fetch(
      `${BASE_URL}/api/models/open_in_explorer?path=${encodeURIComponent(
        path
      )}`,
      { method: "POST", headers }
    );
    if (!res.ok) {
      console.warn("open_in_explorer failed with status", res.status);
    }
  } catch (e) {
    console.error("open_in_explorer error", e);
  }
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
          fetch(`${BASE_URL}/api/system`, {
            headers: { Accept: "application/json" }
          }),
          fetch(`${BASE_URL}/api/system/health`, {
            headers: { Accept: "application/json" }
          })
        ]);
        const infoJson = (await infoRes.json()) as SystemInfoResponse;
        const healthJson = (await healthRes.json()) as HealthResponse;

        // Fallback: fetch Ollama/HF paths from existing endpoints if missing
        try {
          const headers = await authHeader();
          const updates: Partial<PathsInfo> = {};
          if (!infoJson.paths.ollama_models_dir) {
            const r = await fetch(`${BASE_URL}/api/models/ollama_base_path`, {
              headers
            });
            if (r.ok) {
              const j = (await r.json()) as any;
              if (j && typeof j.path === "string")
                updates.ollama_models_dir = j.path;
            }
          }
          if (!infoJson.paths.huggingface_cache_dir) {
            const r = await fetch(
              `${BASE_URL}/api/models/huggingface_base_path`,
              { headers }
            );
            if (r.ok) {
              const j = (await r.json()) as any;
              if (j && typeof j.path === "string")
                updates.huggingface_cache_dir = j.path;
            }
          }
          if (Object.keys(updates).length > 0) {
            infoJson.paths = { ...infoJson.paths, ...updates } as PathsInfo;
          }
        } catch (e) {
          // ignore fallback errors
        }
        if (!cancelled) {
          setInfo(infoJson);
          setHealth(healthJson);
        }
      } catch (e) {
        console.error("Failed to load system info/health", e);
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
    lines.push("Paths:");
    const p = info.paths;
    lines.push(`  settings_path: ${p.settings_path}`);
    lines.push(`  secrets_path: ${p.secrets_path}`);
    lines.push(`  data_dir: ${p.data_dir}`);
    lines.push(`  core_logs_dir: ${p.core_logs_dir}`);
    lines.push(`  core_log_file: ${p.core_log_file}`);
    lines.push(`  ollama_models_dir: ${p.ollama_models_dir}`);
    lines.push(`  huggingface_cache_dir: ${p.huggingface_cache_dir}`);
    lines.push(`  electron_user_data: ${p.electron_user_data}`);
    lines.push(`  electron_log_file: ${p.electron_log_file}`);
    lines.push(`  electron_logs_dir: ${p.electron_logs_dir}`);
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
  }, [info, health]);

  // Build paths list unconditionally to keep hooks order stable
  const paths: Array<{ label: string; value: string }> = useMemo(() => {
    if (!info) return [];
    const list: Array<{ label: string; value: string }> = [
      { label: "Settings", value: info.paths.settings_path },
      { label: "Secrets", value: info.paths.secrets_path },
      { label: "Data Dir", value: info.paths.data_dir },
      { label: "Core Logs Dir", value: info.paths.core_logs_dir },
      { label: "Core Log File", value: info.paths.core_log_file },
      { label: "Ollama Models", value: info.paths.ollama_models_dir },
      { label: "HF Cache (hub)", value: info.paths.huggingface_cache_dir }
    ];
    if (isElectron) {
      list.push(
        { label: "Electron UserData", value: info.paths.electron_user_data },
        { label: "Electron Log File", value: info.paths.electron_log_file },
        { label: "Electron Logs Dir", value: info.paths.electron_logs_dir }
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
                disabled={
                  !value || value.startsWith("~") || value.includes("%")
                }
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
                  <Typography variant="body2" sx={{ minWidth: 220 }}>
                    {c.id}
                  </Typography>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {c.details || ""}
                  </Typography>
                  {c.fix_hint && (
                    <Typography
                      variant="body2"
                      color={theme.vars.palette.grey[400]}
                    >
                      {c.fix_hint}
                    </Typography>
                  )}
                </div>
              ))}
            </Box>
          </div>
        </>
      )}
    </div>
  );
}
