import React, { memo } from "react";
import type { SxProps, Theme } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useEditorScope } from "../../editor_ui";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  Tooltip,
  EditorButton,
  CONTROL,
  MOTION,
  SPACING,
  BORDER_RADIUS
} from "../../ui_primitives";
import { TOOLTIP_DESCRIPTION_DELAY } from "../../../config/constants";

interface ModelSelectButtonProps {
  label: React.ReactNode;
  secondaryLabel?: string;
  subLabel?: string; // "Select model", "Select image model", etc.
  /** Why the selected model cannot run yet, such as a missing API key. */
  warning?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  tooltipTitle?: React.ReactNode;
  sx?: SxProps<Theme>;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * The field that opens a model picker. It reads as a select: an outlined
 * field with the model name, its provider or file in secondary text, and a
 * chevron.
 */
function ModelSelectButton({
  label,
  secondaryLabel,
  subLabel,
  warning,
  onClick,
  active,
  disabled,
  className,
  tooltipTitle,
  sx,
  ref
}: ModelSelectButtonProps) {
  const scope = useEditorScope();

  return (
    <Tooltip
      title={
        tooltipTitle || (
          <FlexColumn gap={SPACING.xs}>
            <Text size="small" weight={500}>
              {label}
            </Text>
            {secondaryLabel && <Caption>{secondaryLabel}</Caption>}
            {warning && (
              <Caption sx={{ color: "warning.main" }}>{warning}</Caption>
            )}
            {subLabel && (
              <Caption sx={{ color: "text.secondary" }}>{subLabel}</Caption>
            )}
          </FlexColumn>
        )
      }
      delay={TOOLTIP_DESCRIPTION_DELAY}
      nextDelay={TOOLTIP_DESCRIPTION_DELAY}
    >
      <EditorButton
        ref={ref}
        className={`select-model-button ${className || ""} ${
          active ? "active" : ""
        }`}
        sx={[
          (theme) => ({
            width: "100%",
            minHeight: CONTROL.height.sm,
            height: "auto",
            justifyContent: "space-between",
            gap: SPACING.sm,
            px: SPACING.md,
            py: SPACING.xs,
            textTransform: "none",
            color: theme.vars.palette.text.primary,
            backgroundColor: theme.vars.palette.Paper.overlay,
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            transition: MOTION.all,
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover,
              borderColor: theme.vars.palette.text.secondary
            }
          }),
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
        onClick={onClick}
        disabled={disabled}
        // Focus returns here when the picker closes on Escape. The focus
        // ring marks it; the pulsating ripple read as a text highlight.
        disableFocusRipple
        size="small"
      >
        <FlexRow
          className="model-select-button-label"
          gap={SPACING.sm}
          align="baseline"
          sx={{ flex: 1, minWidth: 0, overflow: "hidden", textAlign: "left" }}
        >
          <Text
            className="model-select-button-label-text"
            size={scope === "inspector" ? "normal" : "small"}
            weight={active ? 500 : 400}
            truncate
            sx={{
              flexShrink: 1,
              minWidth: 0,
              color: active ? "text.primary" : "text.secondary"
            }}
          >
            {label}
          </Text>
          {secondaryLabel && (
            <Caption
              className="model-select-button-label-text-secondary"
              sx={{
                color: "text.secondary",
                flexShrink: 0,
                whiteSpace: "nowrap"
              }}
            >
              {secondaryLabel}
            </Caption>
          )}
        </FlexRow>
        {warning && (
          <WarningAmberIcon
            className="model-select-button-warning"
            titleAccess={warning}
            fontSize="small"
            sx={{ color: "warning.main", flexShrink: 0 }}
          />
        )}
        <ExpandMoreIcon
          fontSize="small"
          sx={{ color: "text.secondary", flexShrink: 0 }}
        />
      </EditorButton>
    </Tooltip>
  );
}

export default memo(ModelSelectButton);
