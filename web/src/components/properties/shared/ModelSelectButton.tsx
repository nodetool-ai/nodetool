import React, { forwardRef, memo } from "react";
import type { SxProps, Theme } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEditorScope } from "../../editor_ui";
import { FlexColumn, FlexRow, Text, Caption, Tooltip, EditorButton, MOTION, SPACING, getSpacingPx, BORDER_RADIUS } from "../../ui_primitives";

interface ModelSelectButtonProps {
  label: React.ReactNode;
  secondaryLabel?: string;
  subLabel?: string; // "Select Model", "Select Image Model", etc.
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  className?: string;
  tooltipTitle?: React.ReactNode;
  sx?: SxProps<Theme>;
}

const ModelSelectButton = memo(forwardRef<HTMLButtonElement, ModelSelectButtonProps>(
  ({
    label,
    secondaryLabel,
    subLabel,
    onClick,
    active,
    className,
    tooltipTitle,
    sx,
  },
    ref
  ) => {
    const scope = useEditorScope();

    return (
      <Tooltip
        title={
          tooltipTitle || (
            <FlexColumn gap={0.5} sx={{ textAlign: "center" }}>
              <Text>{label}</Text>
              {secondaryLabel && (
                <Caption size="smaller">{secondaryLabel}</Caption>
              )}
              {subLabel && (
                <Caption size="smaller" color="secondary">
                  {subLabel}
                </Caption>
              )}
            </FlexColumn>
          )
        }
        delay={TOOLTIP_ENTER_DELAY * 2}
        nextDelay={TOOLTIP_ENTER_DELAY * 2}
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: "350px !important"
            }
          }
        }}
      >
        <EditorButton
          ref={ref}
          className={`select-model-button ${className || ""} ${active ? "active" : ""
            }`}
          sx={{
            border: "1px solid var(--palette-divider)",
            backgroundColor: active
              ? "var(--palette-action-selected)"
              : "var(--palette-Paper-overlay)",
            borderRadius: BORDER_RADIUS.sm,
            color: "var(--palette-text-primary)",
            textTransform: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            lineHeight: 1.2,
            minHeight: "28px",
            height: "auto",
            padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
            width: "100%",
            transition: MOTION.all,
            "&:hover": {
              backgroundColor: "var(--palette-action-hover)",
              borderColor: "var(--palette-text-secondary)"
            },
            ...sx
          }}
          onClick={onClick}
          size="small"
        >
          <FlexRow
            className="model-select-button-label"
            gap={1}
            align="center"
            sx={{
              textAlign: "left",
              flexGrow: 1,
              overflow: "hidden",
              marginRight: getSpacingPx(SPACING.xs)
            }}
          >
            <Text
              className="model-select-button-label-text"
              size={scope === "inspector" ? "normal" : "small"}
              weight={active ? 500 : 400}
              truncate
              sx={{
                flexShrink: 1,
                minWidth: 0
              }}
            >
              {label}
            </Text>
            {secondaryLabel && (
              <Caption
                className="model-select-button-label-text-secondary"
                size={scope === "inspector" ? "small" : "smaller"}
                sx={{
                  opacity: 0.6,
                  flexShrink: 0,
                  whiteSpace: "nowrap"
                }}
              >
                {secondaryLabel}
              </Caption>
            )}
          </FlexRow>
          <ExpandMoreIcon
            sx={{
              fontSize: 14,
              color: "inherit",
              opacity: 0.7,
              flexShrink: 0,
              ml: 0,
              mr: `-${getSpacingPx(SPACING.xs)}`
            }}
          />
        </EditorButton>
      </Tooltip>
    );
  }
));

ModelSelectButton.displayName = "ModelSelectButton";

export default ModelSelectButton;
