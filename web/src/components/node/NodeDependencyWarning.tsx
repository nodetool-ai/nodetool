/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useState, type FC } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import isEqual from "../../utils/isEqual";
import { getIsElectronDetails } from "../../utils/browser";
import { useOpenPackageManager } from "../../hooks/useOpenPackageManager";
import {
  RUNTIME_LABELS,
  RUNTIME_TO_PACKAGE_ID,
  ensureRuntimeStatuses,
  getCachedRuntimeStatuses
} from "./NodeDependencyWarning.helpers";

const warningStyles = (theme: Theme) =>
  css({
    backgroundColor: `color-mix(in srgb, ${theme.vars.palette.warning.main} 15%, transparent)`,
    borderRadius: BORDER_RADIUS.xs,
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.xs),
    width: "100%",
    maxWidth: "100%",

    ".warning-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.warning.main,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
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
      borderRadius: BORDER_RADIUS.sm,
      padding: `${theme.spacing(1)} ${theme.spacing(3)}`,
      cursor: "pointer",
      marginTop: getSpacingPx(SPACING.micro),
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

const NodeDependencyWarning: FC<NodeDependencyWarningProps> = ({
  requiredRuntimes,
}) => {
  const theme = useTheme();
  const [missingRuntimes, setMissingRuntimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const { isElectron } = getIsElectronDetails();
  const openPackageManager = useOpenPackageManager();

  const checkRuntimes = useCallback(async (forceRefresh = false) => {
    if (!isElectron) {
      setMissingRuntimes(requiredRuntimes);
      setLoading(false);
      return;
    }

    // Only refresh statuses when cache is empty or explicitly forced.
    await ensureRuntimeStatuses(forceRefresh);

    const statuses = getCachedRuntimeStatuses();
    const missing = requiredRuntimes.filter((rt) => {
      const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
      return statuses ? !statuses[pkgId] : true;
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
    const api = window.api;
    if (!api?.packages?.installRuntime) {return;}
    setInstalling(true);
    try {
      for (const rt of missingRuntimes) {
        const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
        await api.packages.installRuntime(pkgId);
      }
      await checkRuntimes(true);
    } catch {
      // fall back to the package manager on error
      openPackageManager();
    } finally {
      setInstalling(false);
    }
  }, [missingRuntimes, checkRuntimes, openPackageManager]);

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
          type="button"
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
