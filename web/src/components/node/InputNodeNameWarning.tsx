import React, { useMemo, memo } from "react";
import { Text, Tooltip } from "../ui_primitives";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

interface InputNodeNameWarningProps {
  nodeType: string;
  name: string | undefined;
}

const InputNodeNameWarning: React.FC<InputNodeNameWarningProps> = ({
  nodeType,
  name
}) => {
  const shouldShowWarning = useMemo(() => {
    if (!nodeType.startsWith("nodetool.input.")) {
      return false;
    }
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
      <Text
        className="input-name-warning nodrag"
        size="smaller"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25em",
          width: "100%",
          textAlign: "center",
          textTransform: "uppercase",
          padding: ".5em !important",
          marginBottom: "0",
          color: "var(--palette-warning-main)",
          backgroundColor: "rgba(var(--palette-warning-mainChannel) / 0.1)",
          cursor: "help"
        }}
      >
        <WarningAmberOutlinedIcon sx={{ fontSize: "var(--fontSizeSmall)" }} />
        Name required
      </Text>
    </Tooltip>
  );
};

export default memo(InputNodeNameWarning);
