import React, { memo } from "react";
import { Button, ButtonGroup, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

type ActionsProps = {
  onCopy?: () => void;
};

const Actions: React.FC<ActionsProps> = ({ onCopy }) => {
  if (!onCopy) return null;
  return (
    <ButtonGroup className="actions">
      <Tooltip title="Copy to Clipboard" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button size="small" onClick={onCopy}>
          Copy
        </Button>
      </Tooltip>
    </ButtonGroup>
  );
};

export default memo(Actions);
