/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";

interface NodeStatusProps {
  status?: string | object | null;
}

const NodeStatus: React.FC<NodeStatusProps> = ({ status }) => {
  const theme = useTheme();
  if (typeof status !== "string") {
    return null;
  }
  if (status !== "booting") {return null;}

  return (
    <Typography
      className="node-status"
      css={css({
        maxWidth: "250px",
        padding: "4px 12px",
        color: theme.vars.palette.warning.main,
        fontSize: "0.75rem"
      })}
    >
      Model is booting, taking minutes.
    </Typography>
  );
};

export default memo(NodeStatus, isEqual);
