import React, { memo } from "react";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface NodeStatusProps {
  status: string;
}

const NodeStatus: React.FC<NodeStatusProps> = ({ status }) => {
  if (status !== "booting") return null;

  return (
    <Typography className="node-status">
      Model is booting, taking minutes.
    </Typography>
  );
};

export default memo(NodeStatus, isEqual);
