import React from "react";
import { Typography } from "@mui/material";

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

export default React.memo(NodeStatus);
