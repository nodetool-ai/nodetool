import React, { memo } from "react";
import { Button, ButtonGroup, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface CopyValueButtonProps {
  onCopy: () => void;
}

const CopyValueButton: React.FC<CopyValueButtonProps> = ({ onCopy }) => (
  <ButtonGroup className="actions">
    <Tooltip title="Copy to Clipboard" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button size="small" onClick={onCopy}>
        Copy
      </Button>
    </Tooltip>
  </ButtonGroup>
);

export default memo(CopyValueButton);
