import React, { memo, useCallback } from "react";
import { Tooltip, IconButton } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ModelsManager from "./ModelsManager";
import { IconForType } from "../../config/data_types";
import { useModelManagerStore } from "../../stores/ModelManagerStore";

const ModelsButton: React.FC = memo(function ModelsButton() {
  const isOpen = useModelManagerStore((state) => state.isOpen);
  const setIsOpen = useModelManagerStore((state) => state.setIsOpen);
  
  const handleOpen = useCallback(() => setIsOpen(true), [setIsOpen]);
  const handleClose = useCallback(() => setIsOpen(false), [setIsOpen]);

  return (
    <>
      <ModelsManager open={isOpen} onClose={handleClose} />
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
