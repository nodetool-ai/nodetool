import React, { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconForType } from "../../config/data_types";
import { ToolbarIconButton } from "../ui_primitives";

const ModelsButton: React.FC = memo(function ModelsButton() {
  const navigate = useNavigate();
  const handleOpen = useCallback(
    () => navigate("/settings?tab=2"),
    [navigate]
  );

  return (
    <ToolbarIconButton
      icon={<IconForType iconName="language_model" showTooltip={false} />}
      tooltip="Model Manager"
      onClick={handleOpen}
      className="models-button"
      nodrag={false}
    />
  );
});

ModelsButton.displayName = "ModelsButton";

export default ModelsButton;
