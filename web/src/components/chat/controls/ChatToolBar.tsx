/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useMemo } from "react";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { LanguageModel } from "../../../stores/ApiTypes";
import { StateIconButton } from "../../ui_primitives/StateIconButton";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../../ui_primitives";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: getSpacingPx(SPACING.sm),
    flexWrap: "wrap",
    minHeight: "44px",
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
    borderRadius: BORDER_RADIUS.xl,
    background: `linear-gradient(135deg, 
      ${theme.vars.palette.grey[900]}ee 0%, 
      ${theme.vars.palette.grey[800]}cc 50%, 
      ${theme.vars.palette.grey[900]}ee 100%)`,
    backdropFilter: "blur(12px)",
    border: `1px solid ${theme.vars.palette.grey[700]}80`,
    boxShadow: `0 4px 24px -4px ${theme.vars.palette.grey[900]}4d, 
                inset 0 1px 0 ${theme.vars.palette.grey[600]}40`,
    transition: `border-color ${MOTION.slow}, box-shadow ${MOTION.slow}`,
    position: "relative",
    overflow: "visible",

    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "1px",
      background: `linear-gradient(90deg, 
        transparent 0%, 
        ${theme.vars.palette.grey[500]}60 50%, 
        transparent 100%)`,
      opacity: 0.6
    },

    "&:hover": {
      border: `1px solid ${theme.vars.palette.grey[600]}90`,
      boxShadow: `0 6px 32px -4px ${theme.vars.palette.grey[900]}66, 
                  inset 0 1px 0 ${theme.vars.palette.grey[500]}50`
    },

    // Group containers
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
      borderRadius: BORDER_RADIUS.lg,
      transition: MOTION.background,

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}30`
      }
    },

    ".toolbar-group-primary": {
      background: `${theme.vars.palette.grey[800]}50`,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.lg,
      border: `1px solid ${theme.vars.palette.grey[700]}40`,
      transition: `${MOTION.background}, ${MOTION.border}`,

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}40`,
        borderColor: `${theme.vars.palette.grey[600]}60`
      }
    },

    // Divider styling
    ".toolbar-divider": {
      height: "24px",
      width: "1px",
      background: `linear-gradient(180deg, 
        transparent 0%, 
        ${theme.vars.palette.grey[600]}60 50%, 
        transparent 100%)`,
      margin: `0 ${getSpacingPx(SPACING.md)}`,
      flexShrink: 0
    },

    // Spacer
    ".toolbar-spacer": {
      flex: 1,
      minWidth: "8px"
    }
  });

interface ChatToolBarProps {
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  allowedProviders?: string[];
  embedded?: boolean;
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedModel,
  onModelChange,
  memoryEnabled,
  onMemoryToggle,
  allowedProviders,
  embedded = false
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const embeddedOverride = useMemo(() => embedded ? css({
    background: "transparent",
    backdropFilter: "none",
    border: "none",
    boxShadow: "none",
    padding: "0",
    minHeight: "auto",
    width: "auto",
    flex: 1,
    "&:hover": {
      border: "none",
      boxShadow: "none"
    },
    "&::before": {
      display: "none"
    }
  }) : null, [embedded]);

  const hasModelSection = onModelChange;

  return (
    <div className={`chat-tool-bar ${embedded ? "embedded" : ""}`} css={[cssStyles, embeddedOverride]}>
      {/* Model Selection Group */}
      {hasModelSection && (
        <div className={`toolbar-group ${!embedded ? "toolbar-group-primary" : ""}`}>
          <LanguageModelSelect
            onChange={(model) => onModelChange(model)}
            value={selectedModel?.id || ""}
            allowedProviders={allowedProviders}
          />
        </div>
      )}

      {/* Spacer to push agent toggle to the right */}
      {!embedded && <div className="toolbar-spacer" />}

      {/* Memory Toggle — sits next to agent mode so the two trust-boundary
          settings (autonomous tool calls, cross-session memory) live together. */}
      {onMemoryToggle && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <StateIconButton
              icon={<PsychologyOutlinedIcon fontSize="small" />}
              tooltip={
                memoryEnabled
                  ? "Long-term memory: ON — recalls facts from prior sessions and mines new ones after each turn"
                  : "Long-term memory: OFF — this session won't recall or store memories"
              }
              isActive={!!memoryEnabled}
              onClick={() => onMemoryToggle(!memoryEnabled)}
              size="small"
            />
          </div>
        </>
      )}

    </div>
  );
};

export default ChatToolBar;
