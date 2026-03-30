import React, { memo, useCallback } from "react";
import { IconForType } from "../../config/data_types";
import { useModelManagerStore } from "../../stores/ModelManagerStore";
import ModelsManager from "./ModelsManager";
import { ToolbarIconButton } from "../ui_primitives";

const ModelsButton: React.FC = memo(function ModelsButton() {
  const isOpen = useModelManagerStore((state) => state.isOpen);
  const setIsOpen = useModelManagerStore((state) => state.setIsOpen);

  // useCallback needed for handleOpen as it's passed to memoized ToolbarIconButton
  const handleOpen = useCallback(() => setIsOpen(true), [setIsOpen]);
  const handleClose = useCallback(() => setIsOpen(false), [setIsOpen]);

  return (
    <>
      <ModelsManager open={isOpen} onClose={handleClose} />
      <ToolbarIconButton
        icon={<IconForType iconName="language_model" showTooltip={false} />}
        tooltip="Model Manager"
        onClick={handleOpen}
        className="models-button"
        nodrag={false}
      />
    </>
  );
});

ModelsButton.displayName = "ModelsButton";

export default ModelsButton;
