/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, ToolbarIconButton, LoadingSpinner, MOTION, BORDER_RADIUS } from "../ui_primitives";
import PlayArrow from "@mui/icons-material/PlayArrow";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

const styles = (theme: Theme, _isRunning: boolean) =>
  css({
    "&.run-button": {
      width: 28,
      height: 28,
      padding: 0,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.common.black,
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.light,
        borderColor: theme.vars.palette.primary.light
      },
      "&.disabled": {
        opacity: 0.7,
        cursor: "not-allowed"
      },
      "& svg": {
        fontSize: 18
      }
    }
  });

interface RunGroupButtonProps {
  isWorkflowRunning: boolean;
  state: string; // "connecting", "connected", "running", or other
  onClick: () => void;
}

const RunGroupButton: React.FC<RunGroupButtonProps> = ({
  isWorkflowRunning,
  state,
  onClick
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const isRunning = state === "running";
  const cssStyles = useMemo(() => styles(theme, isRunning), [theme, isRunning]);

  const handleClick = useCallback(() => {
    if (!isWorkflowRunning) {
      onClick();
    }
  }, [isWorkflowRunning, onClick]);

  return (
    <Tooltip
      title={isWorkflowRunning
        ? t("i18n-next36.nodeEditor.runGroup.groupRunning")
        : t("i18n-next36.nodeEditor.runGroup.runGroup")}
    >
      <ToolbarIconButton
        title={isWorkflowRunning
          ? t("i18n-next36.nodeEditor.runGroup.groupRunning")
          : t("i18n-next36.nodeEditor.runGroup.runGroup")}
        aria-label={isWorkflowRunning
          ? t("i18n-next36.nodeEditor.runGroup.groupRunning")
          : t("i18n-next36.nodeEditor.runGroup.runGroup")}
        size="small"
        tabIndex={-1}
        css={cssStyles}
        className={`run-button ${isWorkflowRunning ? "disabled" : ""}`}
        onClick={handleClick}
      >
        {isRunning ? (
          <LoadingSpinner inline size={16} color="inherit" />
        ) : (
          <PlayArrow />
        )}
      </ToolbarIconButton>
    </Tooltip>
  );
};

export default memo(RunGroupButton);
