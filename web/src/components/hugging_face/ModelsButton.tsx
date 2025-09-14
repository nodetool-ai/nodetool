import React, { memo, useState, useCallback } from "react";
import { Tooltip, IconButton } from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ModelsManager from "./ModelsManager";

const ModelsButton: React.FC = memo(function ModelsButton() {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <ModelsManager open={open} onClose={handleClose} />
      <Tooltip
        title="Model Manager"
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement="bottom"
      >
        <IconButton
          className="nav-button models-button"
          onClick={handleOpen}
          tabIndex={-1}
        >
          <HubIcon />
          <span className="nav-button-text">Models</span>
        </IconButton>
      </Tooltip>
    </>
  );
});

ModelsButton.displayName = "ModelsButton";

export default ModelsButton;
