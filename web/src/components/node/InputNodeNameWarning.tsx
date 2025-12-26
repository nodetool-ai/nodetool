import React, { useMemo, memo } from "react";
import { Typography, Tooltip } from "@mui/material";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

interface InputNodeNameWarningProps {
  nodeType: string;
  name: string | undefined;
}

/**
 * Component that displays a warning when an input node has an empty name.
 * Input nodes require a name property for the workflow to run correctly.
 */
const InputNodeNameWarning: React.FC<InputNodeNameWarningProps> = ({
  nodeType,
  name
}) => {
  const shouldShowWarning = useMemo(() => {
    // Only show warning for input nodes
    if (!nodeType.startsWith("nodetool.input.")) {
      return false;
    }
    // Show warning if name is empty or undefined
    return !name || name.trim() === "";
  }, [nodeType, name]);

  if (!shouldShowWarning) {
    return null;
  }

  return (
    <Tooltip
      title="Input nodes require a name for the workflow to run. Please set a unique name for this input."
      placement="top"
    >
      <Typography
        className="input-name-warning nodrag"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25em",
          width: "100%",
          textAlign: "center",
          fontSize: "var(--fontSizeTiny)",
          textTransform: "uppercase",
          padding: ".5em !important",
          marginBottom: "0",
          color: "var(--palette-warning-main)",
          backgroundColor: (theme) => `${theme.vars.palette.warning.main}1a`,
          cursor: "help"
        }}
      >
        <WarningAmberOutlinedIcon sx={{ fontSize: "var(--fontSizeSmall)" }} />
        Name required
      </Typography>
    </Tooltip>
  );
};

export default memo(InputNodeNameWarning);
