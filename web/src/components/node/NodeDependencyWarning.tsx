/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useState, type FC } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import isEqual from "lodash/isEqual";
import { getIsElectronDetails } from "../../utils/browser";

const RUNTIME_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg & Codecs",
  python: "Python",
  nodejs: "Node.js",
  bash: "Bash",
  ruby: "Ruby",
  lua: "Lua",
  ollama: "Ollama",
  "llama-cpp": "llama.cpp",
  "yt-dlp": "yt-dlp",
  pandoc: "Pandoc",
};

/** Maps required_runtimes values to RuntimePackageId values used by the Electron API. */
const RUNTIME_TO_PACKAGE_ID: Record<string, string> = {
  python: "python",
  nodejs: "nodejs",
  bash: "bash",
  ruby: "ruby",
  lua: "lua",
  ffmpeg: "ffmpeg",
  pandoc: "pandoc",
  "yt-dlp": "yt-dlp",
  ollama: "ollama",
  "llama-cpp": "llama-cpp",
};

const warningStyles = (theme: Theme) =>
  css({
    backgroundColor: `color-mix(in srgb, ${theme.vars.palette.warning.main} 15%, transparent)`,
    borderRadius: "1px",
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "100%",
    maxWidth: "100%",

    ".warning-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.warning.main,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },

    ".warning-text": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.warning.dark,
      lineHeight: "1.3em",
    },

    ".install-link": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.primary.main,
      cursor: "pointer",
      textDecoration: "underline",
      border: "none",
      background: "none",
      padding: 0,
      "&:hover": {
        color: theme.vars.palette.primary.light,
      },
    },
  });

interface NodeDependencyWarningProps {
  requiredRuntimes: string[];
}

/**
 * Cache runtime statuses across all instances so we don't call IPC per-node.
 * Refreshed once per mount cycle (first component to mount triggers the fetch).
 */
let cachedStatuses: Record<string, boolean> | null = null;
let fetchPromise: Promise<void> | null = null;

async function refreshRuntimeStatuses(): Promise<void> {
  const api = (window as any).api;
  if (!api?.packages?.getRuntimeStatuses) return;
  try {
    const statuses: Array<{ id: string; installed: boolean }> =
      await api.packages.getRuntimeStatuses();
    const map: Record<string, boolean> = {};
    for (const s of statuses) {
      map[s.id] = s.installed;
    }
    cachedStatuses = map;
  } catch {
    // If IPC fails, assume nothing is installed so warnings stay visible.
  }
}

const NodeDependencyWarning: FC<NodeDependencyWarningProps> = ({
  requiredRuntimes,
}) => {
  const theme = useTheme();
  const [missingRuntimes, setMissingRuntimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { isElectron } = getIsElectronDetails();

  const checkRuntimes = useCallback(async () => {
    if (!isElectron) {
      setMissingRuntimes(requiredRuntimes);
      setLoading(false);
      return;
    }

    // Invalidate cache so we get fresh statuses.
    cachedStatuses = null;
    if (!fetchPromise) {
      fetchPromise = refreshRuntimeStatuses().finally(() => {
        fetchPromise = null;
      });
    }
    await fetchPromise;

    const missing = requiredRuntimes.filter((rt) => {
      const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
      return cachedStatuses ? !cachedStatuses[pkgId] : true;
    });
    setMissingRuntimes(missing);
    setLoading(false);
  }, [requiredRuntimes, isElectron]);

  useEffect(() => {
    let cancelled = false;
    checkRuntimes().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [checkRuntimes]);

  // Re-check when window regains focus (e.g. after installing a runtime).
  useEffect(() => {
    if (missingRuntimes.length === 0) return;
    const onFocus = () => {
      checkRuntimes();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [missingRuntimes.length, checkRuntimes]);

  if (loading || missingRuntimes.length === 0) {
    return null;
  }

  const runtimeNames = missingRuntimes
    .map((r) => RUNTIME_LABELS[r] || r)
    .join(", ");

  const handleOpenPackageManager = () => {
    const api = (window as any).api;
    if (api?.packages?.showManager) {
      api.packages.showManager();
    }
  };

  return (
    <div
      css={warningStyles(theme)}
      className="node-dependency-warning nodrag nowheel"
    >
      <div className="warning-title">
        <WarningAmberIcon sx={{ fontSize: 14 }} />
        Requires {runtimeNames}
      </div>
      <div className="warning-text">
        {isElectron ? (
          <>
            Install via the{" "}
            <button className="install-link" onClick={handleOpenPackageManager}>
              Package Manager
            </button>{" "}
            to use this node.
          </>
        ) : (
          <>This runtime must be installed on your system to use this node.</>
        )}
      </div>
    </div>
  );
};

export default memo(NodeDependencyWarning, isEqual);
