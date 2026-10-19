import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { useNodes } from "../../contexts/NodeContext";
import { Text, Tooltip, getSpacingPx, SPACING, ICON_SIZE } from "../ui_primitives";

const INPUT_PREFIX = "nodetool.input.";

interface InputNodeNameWarningProps {
  nodeId: string;
  nodeType: string;
  name: string | undefined;
}

const InputNodeNameWarning: React.FC<InputNodeNameWarningProps> = ({
  nodeId,
  nodeType,
  name
}) => {
  const { t } = useTranslation();
  const isInput = nodeType.startsWith(INPUT_PREFIX);
  const isMissing = isInput && (!name || name.trim() === "");
  // Inputs sharing a name collapse into one parameter: one port on a
  // Workflow or Subgraph node, one value for both.
  const isDuplicate = useNodes(
    (state) =>
      isInput &&
      !isMissing &&
      state.nodes.some(
        (node) =>
          node.id !== nodeId &&
          node.type?.startsWith(INPUT_PREFIX) === true &&
          node.data.properties?.name === name
      )
  );

  if (!isMissing && !isDuplicate) {
    return null;
  }

  return (
    <Tooltip
      title={
        isMissing
          ? t("i18n-next36.nodeEditor.inputNodeNameWarning.missingTooltip")
          : t("i18n-next36.nodeEditor.inputNodeNameWarning.duplicateTooltip", {
              name
            })
      }
      placement="top"
    >
      <Text
        className="input-name-warning nodrag"
        size="smaller"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: getSpacingPx(SPACING.xs),
          width: "100%",
          textAlign: "center",
          textTransform: "uppercase",
          padding: `${getSpacingPx(SPACING.md)} !important`,
          marginBottom: "0",
          color: "var(--palette-warning-main)",
          backgroundColor: "rgba(var(--palette-warning-mainChannel) / 0.1)",
          cursor: "help"
        }}
      >
        <WarningAmberOutlinedIcon sx={{ fontSize: ICON_SIZE.xs }} />
        {isMissing
          ? t("i18n-next36.nodeEditor.inputNodeNameWarning.nameRequired")
          : t("i18n-next36.nodeEditor.inputNodeNameWarning.duplicateName")}
      </Text>
    </Tooltip>
  );
};

export default memo(InputNodeNameWarning);
