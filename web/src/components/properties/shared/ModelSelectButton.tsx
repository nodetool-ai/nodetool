import React, { forwardRef, memo } from "react";
import { Button, Tooltip, SxProps, Theme } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEditorScope } from "../../editor_ui";
import { FlexColumn, FlexRow, Text, Caption } from "../../ui_primitives";

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
    sx, // Add sx prop
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
                <Caption size="tiny" color="secondary">
                  {subLabel}
                </Caption>
              )}
            </FlexColumn>
          )
        }
        enterDelay={TOOLTIP_ENTER_DELAY * 2}
        enterNextDelay={TOOLTIP_ENTER_DELAY * 2}
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: "350px !important"
            }
          }
        }}
      >
        <Button
          ref={ref}
          className={`select-model-button ${className || ""} ${active ? "active" : ""
            }`}
          sx={{
            border: "1px solid var(--palette-divider)",
            backgroundColor: active
              ? "var(--palette-action-selected)"
              : "var(--palette-background-paper)",
            borderRadius: "var(--rounded-buttonSmall, 4px)",
            color: "var(--palette-text-primary)",
            textTransform: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            lineHeight: 1.2,
            minHeight: "28px",
            height: "auto",
            padding: "4px 8px",
            width: "100%",
            transition: "all 0.2s ease-in-out",
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
            gap={0.75}
            align="center"
            sx={{
              textAlign: "left",
              flexGrow: 1,
              overflow: "hidden",
              marginRight: "4px"
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
                size={scope === "inspector" ? "small" : "tiny"}
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
              mr: "-4px"
            }}
          />
        </Button>
      </Tooltip>
    );
  }
));

ModelSelectButton.displayName = "ModelSelectButton";

export default ModelSelectButton;
