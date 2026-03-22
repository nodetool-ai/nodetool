import React, { memo } from "react";
import { CopyButton } from "../../ui_primitives";
import { Box } from "@mui/material";

type ActionsProps = {
  copyValue?: unknown;
};

const Actions: React.FC<ActionsProps> = ({ copyValue }) => {
  if (copyValue === undefined || copyValue === null) {
    return null;
  }
  return (
    <Box className="actions">
      <CopyButton value={copyValue} buttonSize="small" tabIndex={-1} />
    </Box>
  );
};

export default memo(Actions);
