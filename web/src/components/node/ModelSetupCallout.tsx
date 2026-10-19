/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { useProviders } from "../../hooks/useProviders";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import { Text, EditorButton, ToolbarIconButton, MOTION, ICON_SIZE } from "../ui_primitives";

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
  const { t } = useTranslation();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const { providers, isLoading, error } = useProviders();

  const noProvider = !isLoading && !error && providers.length === 0;

  const handleAddKeys = useCallback(() => {
    onDismiss();
    openProviderOnboarding({
      reason: t("i18n-next36.nodeEditor.modelSetupCallout.onboardingReason")
    });
  }, [onDismiss, t]);

  return (
    <div css={cssStyles} className="nodrag nowheel">
      <ToolbarIconButton
        className="callout-close"
        size="small"
        aria-label={t("i18n-next36.nodeEditor.modelSetupCallout.dismiss")}
        tooltip={t("i18n-next36.nodeEditor.modelSetupCallout.dismiss")}
        onClick={onDismiss}
        icon={<CloseOutlinedIcon sx={{ fontSize: ICON_SIZE.xs }} />}
      />
      <div className="callout-row">
        {noProvider ? (
          <KeyRoundedIcon className="callout-icon" />
        ) : (
          <TuneRoundedIcon className="callout-icon" />
        )}
        <Text size="small" sx={{ pr: 2 }}>
          {noProvider
            ? t("i18n-next36.nodeEditor.modelSetupCallout.connectProvider")
            : t("i18n-next36.nodeEditor.modelSetupCallout.pickModel")}
        </Text>
      </div>
      {noProvider && (
        <EditorButton
          variant="contained"
          color="primary"
          size="small"
          startIcon={<KeyRoundedIcon />}
          onClick={handleAddKeys}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("i18n-next36.nodeEditor.modelSetupCallout.addApiKeys")}
        </EditorButton>
      )}
    </div>
  );
};

ModelSetupCallout.displayName = "ModelSetupCallout";

export default memo(ModelSetupCallout);
