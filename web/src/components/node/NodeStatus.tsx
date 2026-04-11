/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { Text } from "../ui_primitives";
import isEqual from "fast-deep-equal";
import { useTheme } from "@mui/material/styles";

interface NodeStatusProps {
  status?: string;
}

const NodeStatus: React.FC<NodeStatusProps> = ({ status }) => {
  const theme = useTheme();
  if (status !== "booting") {return null;}

  return (
    <Text
      className="node-status"
      size="smaller"
      color="warning"
      css={css({
        maxWidth: "250px",
        padding: "4px 12px"
      })}
    >
      Model is booting, taking minutes.
    </Text>
  );
};

export default memo(NodeStatus, isEqual);
