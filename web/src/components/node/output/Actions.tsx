import React, { memo } from "react";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
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
      <CopyToClipboardButton copyValue={copyValue} size="small" />
    </Box>
  );
};

export default memo(Actions);
