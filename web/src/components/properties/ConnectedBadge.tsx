/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo } from "react";
import LinkIcon from "@mui/icons-material/Link";
import { useTheme } from "@mui/material/styles";

/**
 * Small icon badge displayed when a property input is connected to another node.
 * Shows only a link icon to indicate connection status.
 */
const ConnectedBadge: React.FC = () => {
  const theme = useTheme();

  return (
    <div
      className="connected-badge"
      css={css({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: theme.vars.palette.text.secondary,
        userSelect: "none",
        "& svg": {
          fontSize: "0.85rem",
        },
      })}
    >
      <LinkIcon />
    </div>
  );
};

export default memo(ConnectedBadge);
