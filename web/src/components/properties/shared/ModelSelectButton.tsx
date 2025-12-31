import React, { forwardRef } from "react";
import { Button, Typography, Tooltip } from "@mui/material";
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
}

const ModelSelectButton = forwardRef<HTMLButtonElement, ModelSelectButtonProps>(
  (
    {
      label,
      secondaryLabel,
      subLabel,
      onClick,
      active,
      className,
      tooltipTitle
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
                    color: "var(--palette-grey-400)",
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
          className={`select-model-button ${className || ""} ${
            active ? "active" : ""
          }`}
          sx={{
            border: active
              ? "1px solid var(--palette-divider)"
              : "1px solid var(--palette-warning-main)",
            backgroundColor: active
              ? "var(--palette-primary-main) !important"
              : "var(--palette-warning-main) !important",
            borderRadius: "4px",
            color: "var(--palette-text-primary)",
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            lineHeight: 1.2,
            minHeight: "28px",
            height: "auto",
            padding: "4px 8px !important",
            width: "100%",
            // backgroundColor: "var(--palette-background-default)",
            "&:hover": {
              backgroundColor: "var(--palette-action-hover)",
              borderColor: "var(--palette-primary-main)"
            }
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
                color: "var(--palette-common-black)",
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
                whiteSpace: "normal"
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
                  color: "var(--palette-common-white)",
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
              fontSize: 12,
              color: "var(--palette-grey-800)",
              flexShrink: 0,
              ml: 0,
              mr: "-6px",
              opacity: 0.7
            }}
          />
        </Button>
      </Tooltip>
    );
  }
);

ModelSelectButton.displayName = "ModelSelectButton";

export default ModelSelectButton;
