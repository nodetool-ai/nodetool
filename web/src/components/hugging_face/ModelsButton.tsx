import React, { memo, useState, useCallback } from "react";
import { Tooltip, IconButton } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ModelsManager from "./ModelsManager";
import { IconForType } from "../../config/data_types";

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
          <IconForType iconName="language_model" showTooltip={false} />
          <span className="nav-button-text">Models</span>
        </IconButton>
      </Tooltip>
    </>
  );
});

ModelsButton.displayName = "ModelsButton";

export default ModelsButton;
