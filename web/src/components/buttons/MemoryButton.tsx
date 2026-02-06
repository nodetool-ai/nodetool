import React, { useState, useCallback } from "react";
import { IconButton, Tooltip } from "@mui/material";
import MemoryIcon from "@mui/icons-material/Memory";
import MemoryManagementDialog from "../dialogs/MemoryManagementDialog";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const MemoryButton: React.FC = () => {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <Tooltip title="Memory Management" enterDelay={TOOLTIP_ENTER_DELAY}>
        <IconButton
          className="command-icon"
          onClick={handleOpen}
          size="small"
          tabIndex={-1}
        >
          <MemoryIcon />
        </IconButton>
      </Tooltip>
      <MemoryManagementDialog open={open} onClose={handleClose} />
    </>
  );
};

export default MemoryButton;
