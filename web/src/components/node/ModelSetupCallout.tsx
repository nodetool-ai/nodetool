/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { useProviders } from "../../hooks/useProviders";
import { Text, EditorButton, ToolbarIconButton, MOTION } from "../ui_primitives";

const enter = keyframes({
  from: { opacity: 0, transform: "translateY(-4px)" },
  to: { opacity: 1, transform: "translateY(0)" }
});

const styles = (theme: Theme) =>
  css({
    position: "relative",
    marginTop: 6,
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
    borderRadius: theme.rounded.buttonSmall,
    border: `1px solid ${theme.vars.palette.primary.main}`,
    backgroundColor: `rgba(var(--palette-primary-mainChannel) / 0.12)`,
    boxShadow: `0 0 12px 2px rgba(var(--palette-primary-mainChannel) / 0.35)`,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    animation: `${enter} ${MOTION.normal}`,
    // Arrow pointing up at the model selector above.
    "&::before": {
      content: '""',
      position: "absolute",
      top: -6,
      left: 14,
      width: 10,
      height: 10,
      backgroundColor: theme.vars.palette.background.paper,
      borderLeft: `1px solid ${theme.vars.palette.primary.main}`,
      borderTop: `1px solid ${theme.vars.palette.primary.main}`,
      transform: "rotate(45deg)"
    },
    ".callout-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: 6
    },
    ".callout-icon": {
      fontSize: 16,
      color: theme.vars.palette.primary.main,
      marginTop: theme.spacing(0.5),
      flexShrink: 0
    },
    ".callout-close": {
      position: "absolute",
      top: 2,
      right: 2
    }
  });

interface ModelSetupCalloutProps {
  onDismiss: () => void;
}

/**
 * Inline call-out shown beneath a model selector in the inspector when a run
 * was blocked because the model is unset. Two messages:
 * - No provider configured → guide to add an API key in Settings.
 * - A provider exists → tell the user to pick a model in the selector above.
 */
const ModelSetupCallout: React.FC<ModelSetupCalloutProps> = ({ onDismiss }) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const navigate = useNavigate();
  const { providers, isLoading, error } = useProviders();

  const noProvider = !isLoading && !error && providers.length === 0;

  const handleAddKeys = useCallback(() => {
    onDismiss();
    navigate("/settings?tab=1");
  }, [onDismiss, navigate]);

  return (
    <div css={cssStyles} className="nodrag nowheel">
      <ToolbarIconButton
        className="callout-close"
        size="small"
        aria-label="Dismiss"
        tooltip="Dismiss"
        onClick={onDismiss}
        icon={<CloseRoundedIcon sx={{ fontSize: 14 }} />}
      />
      <div className="callout-row">
        {noProvider ? (
          <KeyRoundedIcon className="callout-icon" />
        ) : (
          <TuneRoundedIcon className="callout-icon" />
        )}
        <Text size="small" sx={{ pr: 2 }}>
          {noProvider
            ? "Connect an AI provider to use models — add an API key to get started."
            : "Pick a model here before running this workflow."}
        </Text>
      </div>
      {noProvider && (
        <EditorButton
          variant="contained"
          color="primary"
          size="small"
          startIcon={<KeyRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={handleAddKeys}
          sx={{ alignSelf: "flex-start" }}
        >
          Add API keys
        </EditorButton>
      )}
    </div>
  );
};

ModelSetupCallout.displayName = "ModelSetupCallout";

export default memo(ModelSetupCallout);
