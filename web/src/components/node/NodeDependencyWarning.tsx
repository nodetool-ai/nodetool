/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useState, type FC } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import isEqual from "fast-deep-equal";
import { getIsElectronDetails } from "../../utils/browser";

export const RUNTIME_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg & Codecs",
  python: "Python",
  nodejs: "Node.js",
  bash: "Bash",
  ruby: "Ruby",
  lua: "Lua",
  "yt-dlp": "yt-dlp",
  pandoc: "Pandoc",
  pdftotext: "PDF Tools (Poppler)",
};

/** Maps required_runtimes values to RuntimePackageId values used by the Electron API. */
export const RUNTIME_TO_PACKAGE_ID: Record<string, string> = {
  python: "python",
  nodejs: "nodejs",
  bash: "bash",
  ruby: "ruby",
  lua: "lua",
  ffmpeg: "ffmpeg",
  pandoc: "pandoc",
  pdftotext: "pdftotext",
  "yt-dlp": "yt-dlp",
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

    ".install-btn": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.common.white,
      backgroundColor: theme.vars.palette.primary.main,
      border: "none",
      borderRadius: "3px",
      padding: "3px 10px",
      cursor: "pointer",
      marginTop: "2px",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark,
      },
      "&:disabled": {
        opacity: 0.6,
        cursor: "default",
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

export async function refreshRuntimeStatuses(): Promise<void> {
  const api = (window as any).api;
  if (!api?.packages?.getRuntimeStatuses) {return;}
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

export function getCachedRuntimeStatuses(): Record<string, boolean> | null {
  return cachedStatuses;
}

const NodeDependencyWarning: FC<NodeDependencyWarningProps> = ({
  requiredRuntimes,
}) => {
  const theme = useTheme();
  const [missingRuntimes, setMissingRuntimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const { isElectron } = getIsElectronDetails();

  const checkRuntimes = useCallback(async (forceRefresh = false) => {
    if (!isElectron) {
      setMissingRuntimes(requiredRuntimes);
      setLoading(false);
      return;
    }

    // Only refresh statuses when cache is empty or explicitly forced.
    if (!cachedStatuses || forceRefresh) {
      if (!fetchPromise) {
        fetchPromise = refreshRuntimeStatuses().finally(() => {
          fetchPromise = null;
        });
      }
      await fetchPromise;
    }

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
      if (cancelled) {return;}
    });
    return () => {
      cancelled = true;
    };
  }, [checkRuntimes]);

  // Re-check when window regains focus (e.g. after installing a runtime).
  useEffect(() => {
    if (missingRuntimes.length === 0) {return;}
    const onFocus = () => {
      checkRuntimes(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [missingRuntimes.length, checkRuntimes]);

  const handleInstall = useCallback(async () => {
    const api = (window as any).api;
    if (!api?.packages?.installRuntime) {return;}
    setInstalling(true);
    try {
      for (const rt of missingRuntimes) {
        const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
        await api.packages.installRuntime(pkgId);
      }
      await checkRuntimes(true);
    } catch {
      // fall back to package manager on error
      api.packages?.showManager?.();
    } finally {
      setInstalling(false);
    }
  }, [missingRuntimes, checkRuntimes]);

  if (loading || missingRuntimes.length === 0) {
    return null;
  }

  const runtimeNames = missingRuntimes
    .map((r) => RUNTIME_LABELS[r] || r)
    .join(", ");

  return (
    <div
      css={warningStyles(theme)}
      className="node-dependency-warning nodrag nowheel"
    >
      <div className="warning-title">
        <WarningAmberIcon sx={{ fontSize: 14 }} />
        Requires {runtimeNames}
      </div>
      {isElectron ? (
        <button
          className="install-btn"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? "Installing..." : `Install ${runtimeNames}`}
        </button>
      ) : (
        <div className="warning-text">
          This runtime must be installed on your system to use this node.
        </div>
      )}
    </div>
  );
};

export default memo(NodeDependencyWarning, isEqual);
