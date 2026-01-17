/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";
import useValidationStore, { NodeWarning } from "../../stores/ValidationStore";
import isEqual from "lodash/isEqual";

const warningStyles = (theme: Theme) =>
  css({
    position: "relative",
    backgroundColor: theme.vars.palette.warning.light,
    border: `1px solid ${theme.vars.palette.warning.main}`,
    borderRadius: "4px",
    padding: "8px 10px",
    transition: "background-color 0.2s",
    display: "flex",
    width: "100%",
    maxWidth: "100%",
    alignItems: "center",
    gap: "8px",

    ".warning-icon": {
      color: theme.vars.palette.warning.main,
      flexShrink: 0
    },

    ".warning-text": {
      flex: 1,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.warning.contrastText ?? theme.vars.palette.grey[900],
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.3em",
      overflowWrap: "break-word",
      wordBreak: "break-word"
    },

    ".dismiss-button": {
      flexShrink: 0,
      padding: "2px",
      opacity: 0.6,
      "&:hover": {
        opacity: 1
      },
      transition: "opacity 0.2s ease",
      color: theme.vars.palette.warning.main
    }
  });

const warningListStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%"
  });

interface NodeWarningsProps {
  id: string;
  workflowId: string;
  warnings?: NodeWarning[];
  onDismiss?: (warning: NodeWarning) => void;
  maxDisplay?: number;
}

export const NodeWarnings: React.FC<NodeWarningsProps> = memo(function NodeWarnings({
  id,
  workflowId,
  warnings: propWarnings,
  onDismiss,
  maxDisplay = 3
}) {
  const theme = useTheme();
  const storeWarnings = useValidationStore((state) =>
    workflowId !== undefined ? state.getWarnings(workflowId, id) : []
  );
  const clearNodeWarnings = useValidationStore((state) => state.clearNodeWarnings);

  const warnings = propWarnings ?? storeWarnings;

  const handleDismiss = useCallback(
    (warning: NodeWarning) => {
      if (onDismiss) {
        onDismiss(warning);
      } else {
        clearNodeWarnings(workflowId, id);
      }
    },
    [onDismiss, clearNodeWarnings, workflowId, id]
  );

  if (!warnings || warnings.length === 0) {
    return null;
  }

  const displayWarnings = warnings.slice(0, maxDisplay);
  const hiddenCount = warnings.length - maxDisplay;

  if (warnings.length === 1) {
    const warning = warnings[0];
    return (
      <div css={warningStyles(theme)} className="node-warning nodrag nowheel">
        <WarningAmberIcon fontSize="small" className="warning-icon" />
        <div className="warning-text">
          {warning.handle
            ? `Missing input: ${warning.handle}`
            : warning.property
              ? `Missing property: ${warning.property}`
              : warning.message}
        </div>
        <Tooltip title="Dismiss warning">
          <IconButton
            className="dismiss-button"
            size="small"
            onClick={() => handleDismiss(warning)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
    );
  }

  return (
    <div css={warningStyles(theme)} className="node-warning nodrag nowheel">
      <div css={warningListStyles(theme)}>
        {displayWarnings.map((warning, index) => (
          <div
            key={`${warning.type}-${warning.handle ?? warning.property ?? index}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, overflow: "hidden" }}>
              <WarningAmberIcon fontSize="small" className="warning-icon" />
              <span className="warning-text" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {warning.handle
                  ? `Input: ${warning.handle}`
                  : warning.property
                    ? `Prop: ${warning.property}`
                    : warning.message}
              </span>
            </div>
            <Tooltip title="Dismiss">
              <IconButton
                className="dismiss-button"
                size="small"
                onClick={() => handleDismiss(warning)}
                style={{ flexShrink: 0 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="warning-text" style={{ fontStyle: "italic", opacity: 0.8 }}>
            +{hiddenCount} more warning{hiddenCount > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}, isEqual);

export default memo(NodeWarnings, isEqual);
