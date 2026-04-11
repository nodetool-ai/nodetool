/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo } from "react";
import LinkIcon from "@mui/icons-material/Link";
import { useTheme } from "@mui/material/styles";

interface ConnectedBadgeProps {
  sourceName?: string;
}

/**
 * Small badge displayed when a property input is connected to another node.
 * Shows a link icon with optional source node name.
 */
const ConnectedBadge: React.FC<ConnectedBadgeProps> = ({ sourceName }) => {
  const theme = useTheme();

  return (
    <div
      className="connected-badge"
      css={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "4px 8px",
        borderRadius: "3px",
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.secondary,
        fontSize: theme.fontSizeSmaller,
        lineHeight: 1.4,
        minHeight: "24px",
        boxSizing: "border-box",
        userSelect: "none",
        "& svg": {
          fontSize: "0.8rem",
        },
      })}
    >
      <LinkIcon />
      <span>{sourceName || "Connected"}</span>
    </div>
  );
};

export default memo(ConnectedBadge);
