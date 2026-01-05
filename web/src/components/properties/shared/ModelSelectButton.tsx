import React, { forwardRef } from "react";
import { Button, Typography, Tooltip, SxProps, Theme } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEditorScope } from "../../editor_ui";

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

const ModelSelectButton = forwardRef<HTMLButtonElement, ModelSelectButtonProps>(
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
    const theme = useTheme();
    const scope = useEditorScope();

    return (
      <Tooltip
        title={
          tooltipTitle || (
            <div style={{ textAlign: "center" }}>
              <Typography variant="inherit">{label}</Typography>
              {secondaryLabel && (
                <Typography variant="caption" display="block">
                  {secondaryLabel}
                </Typography>
              )}
              {subLabel && (
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontSize: "var(--fontSizeSmaller)"
                  }}
                  display="block"
                >
                  {subLabel}
                </Typography>
              )}
            </div>
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
            border: active
              ? "1px solid var(--palette-secondary-main)"
              : "1px solid var(--palette-divider)", // Changed from warning-main
            backgroundColor: active
              ? "var(--palette-secondary-main)"
              : "var(--palette-background-paper)", // Changed from warning-main
            borderRadius: "var(--rounded-buttonSmall, 4px)", // Use theme var
            color: active ? "var(--palette-secondary-contrastText)" : "var(--palette-text-primary)",
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            lineHeight: 1.2,
            minHeight: "28px",
            height: "auto",
            padding: "4px 8px",
            width: "100%",
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: active
                ? "var(--palette-secondary-dark)"
                : "var(--palette-action-hover)",
              borderColor: active
                ? "var(--palette-secondary-dark)"
                : "var(--palette-secondary-main)"
            },
            ...sx
          }}
          onClick={onClick}
          size="small"
        >
          <div
            className="model-select-button-label"
            style={{
              textAlign: "left",
              flexGrow: 1,
              overflow: "hidden",
              marginRight: "4px"
            }}
          >
            <Typography
              className="model-select-button-label-text"
              component="div"
              variant="body2"
              sx={{
                color: "inherit", // Inherit from button color
                fontSize:
                  scope === "inspector"
                    ? theme.fontSizeSmall
                    : theme.fontSizeTinyer,
                lineHeight: "1.2em",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "normal",
                fontWeight: active ? 500 : 400
              }}
            >
              {label}
            </Typography>
            {secondaryLabel && (
              <Typography
                className="model-select-button-label-text-secondary"
                component="div"
                variant="body2"
                sx={{
                  color: "inherit", // Inherit
                  opacity: 0.8,
                  lineHeight: "1.1em",
                  display: "block",
                  fontSize:
                    scope === "inspector"
                      ? theme.fontSizeSmall
                      : theme.fontSizeTinyer,
                  fontWeight: "light",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {secondaryLabel}
              </Typography>
            )}
          </div>
          <ExpandMoreIcon
            sx={{
              fontSize: 14, // Slightly larger
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
);

ModelSelectButton.displayName = "ModelSelectButton";

export default ModelSelectButton;
