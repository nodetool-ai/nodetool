/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import { EditorButton, Tooltip } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface SettingsButtonProps {
  buttonText?: string;
  className?: string;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({
  buttonText = "",
  className
}) => {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  return (
    <Tooltip title="Settings" delay={TOOLTIP_ENTER_DELAY}>
      <EditorButton
        tabIndex={-1}
        className={`settings-button command-icon${className ? ` ${className}` : ""}`}
        aria-label="Open settings"
        onClick={handleClick}
      >
        <SettingsIcon />
        {buttonText}
      </EditorButton>
    </Tooltip>
  );
};

export default memo(SettingsButton);
