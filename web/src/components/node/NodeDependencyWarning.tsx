/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState, type FC } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS, SPACING, getSpacingPx, EditorButton } from "../ui_primitives";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import isEqual from "../../utils/isEqual";
import { getIsElectronDetails } from "../../utils/browser";
import { useOpenPackageManager } from "../../hooks/useOpenPackageManager";
import useRuntimeStatusStore from "../../stores/RuntimeStatusStore";
import {
  RUNTIME_LABELS,
  RUNTIME_TO_PACKAGE_ID,
  ensureRuntimeStatuses
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
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.warning.dark,
      lineHeight: "1.3em",
    },

    ".install-link": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
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

const NodeDependencyWarning: FC<NodeDependencyWarningProps> = ({
  requiredRuntimes,
}) => {
  const theme = useTheme();
  const memoizedWarningStyles = useMemo(() => warningStyles(theme), [theme]);
  const statuses = useRuntimeStatusStore((s) => s.statuses);
  const loaded = useRuntimeStatusStore((s) => s.loaded);
  const [installing, setInstalling] = useState(false);
  const { isElectron } = getIsElectronDetails();
  const openPackageManager = useOpenPackageManager();

  const missingRuntimes = useMemo(
    () =>
      requiredRuntimes.filter((rt) => {
        const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
        return statuses ? !statuses[pkgId] : true;
      }),
    [requiredRuntimes, statuses]
  );

  useEffect(() => {
    void ensureRuntimeStatuses();
  }, []);

  // Re-check when window regains focus (e.g. after installing a runtime
  // outside the app).
  useEffect(() => {
    if (missingRuntimes.length === 0) {return;}
    const onFocus = () => {
      void ensureRuntimeStatuses(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [missingRuntimes.length]);

  const handleInstall = useCallback(async () => {
    const api = window.api;
    if (!api?.packages?.installRuntime) {return;}
    setInstalling(true);
    try {
      for (const rt of missingRuntimes) {
        const pkgId = RUNTIME_TO_PACKAGE_ID[rt] ?? rt;
        await api.packages.installRuntime(pkgId);
      }
      await ensureRuntimeStatuses(true);
    } catch {
      // fall back to the package manager on error
      openPackageManager();
    } finally {
      setInstalling(false);
    }
  }, [missingRuntimes, openPackageManager]);

  if (!loaded || missingRuntimes.length === 0) {
    return null;
  }

  const runtimeNames = missingRuntimes
    .map((r) => RUNTIME_LABELS[r] || r)
    .join(", ");

  return (
    <div
      css={memoizedWarningStyles}
      className="node-dependency-warning nodrag nowheel"
    >
      <div className="warning-title">
        <WarningAmberIcon sx={{ fontSize: 14 }} />
        Requires {runtimeNames}
      </div>
      {isElectron ? (
        <EditorButton
          variant="contained"
          onClick={handleInstall}
          disabled={installing}
          sx={{ alignSelf: "flex-start", mt: SPACING.micro }}
        >
          {installing ? "Installing…" : `Install ${runtimeNames}`}
        </EditorButton>
      ) : (
        <div className="warning-text">
          Install it on the machine running the NodeTool server to use this
          node.
        </div>
      )}
    </div>
  );
};

export default memo(NodeDependencyWarning, isEqual);
