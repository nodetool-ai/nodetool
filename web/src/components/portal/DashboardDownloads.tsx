/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import DownloadingIcon from "@mui/icons-material/Downloading";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { wrapStyles } from "./dashboardChrome";
import { MOTION, SPACING, getSpacingPx } from "../ui_primitives";

const ACTIVE_STATUSES = new Set(["pending", "running", "start", "progress"]);

const styles = (theme: Theme) =>
  css({
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.c_node_bg,

    ".downloads-inner": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg), // was 10px
      padding: `${getSpacingPx(SPACING.md)} 0`,
      fontSize: 13,
      color: theme.vars.palette.text.secondary,
      "& svg": {
        width: 17,
        height: 17,
        color: theme.vars.palette.primary.main
      }
    },
    ".downloads-bar": {
      width: 90,
      height: 4,
      borderRadius: 2,
      overflow: "hidden",
      background: theme.vars.palette.action.selected
    },
    ".downloads-bar-fill": {
      height: "100%",
      background: theme.vars.palette.primary.main,
      transition: `width ${MOTION.slow}`
    },
    ".downloads-view": {
      background: "none",
      border: "none",
      padding: 0,
      font: "inherit",
      fontSize: 13,
      color: theme.vars.palette.primary.main,
      cursor: "pointer",
      "&:hover": { color: theme.vars.palette.primary.light }
    }
  });

/**
 * Slim banner on the dashboard while local models download in the
 * background (the Electron boot screen shows this, but once the app is up
 * the web UI previously gave no hint). Links to the download manager.
 */
const DashboardDownloads: React.FC = () => {
  const theme = useTheme();
  const { downloads, openDialog } = useModelDownloadStore(
    useShallow((state) => ({
      downloads: state.downloads,
      openDialog: state.openDialog
    }))
  );

  const { activeCount, progress } = useMemo(() => {
    const active = Object.values(downloads).filter((d) =>
      ACTIVE_STATUSES.has(d.status)
    );
    const total = active.reduce((sum, d) => sum + d.totalBytes, 0);
    const done = active.reduce((sum, d) => sum + d.downloadedBytes, 0);
    return {
      activeCount: active.length,
      progress: total > 0 ? (done / total) * 100 : null
    };
  }, [downloads]);

  if (activeCount === 0) {
    return null;
  }

  return (
    <section css={styles(theme)} aria-label="Model downloads in progress">
      <div css={wrapStyles(theme)}>
        <div className="downloads-inner">
          <DownloadingIcon />
          <span>
            {activeCount === 1
              ? "Downloading 1 model in the background"
              : `Downloading ${activeCount} models in the background`}
            {progress !== null && ` — ${progress.toFixed(0)}%`}
          </span>
          {progress !== null && (
            <span className="downloads-bar">
              <span
                className="downloads-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </span>
          )}
          <button type="button" className="downloads-view" onClick={openDialog}>
            View details
          </button>
        </div>
      </div>
    </section>
  );
};

export default memo(DashboardDownloads);
