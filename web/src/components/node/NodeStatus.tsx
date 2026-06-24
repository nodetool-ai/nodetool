/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { Text, SPACING, getSpacingPx } from "../ui_primitives";
import isEqual from "fast-deep-equal";

const statusCss = css({
  maxWidth: "250px",
  padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`
});

interface NodeStatusProps {
  status?: string;
}

const NodeStatus: React.FC<NodeStatusProps> = ({ status }) => {
  if (status !== "booting") {return null;}

  return (
    <Text
      className="node-status"
      size="smaller"
      color="warning"
      css={statusCss}
    >
      Model is booting, taking minutes.
    </Text>
  );
};

export default memo(NodeStatus, isEqual);
