/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { Box } from "@mui/material";
import { useNodeLabelStore } from "../../stores/NodeLabelStore";

interface NodeLabelsDisplayProps {
  nodeId: string;
  maxVisible?: number;
}

export const NodeLabelsDisplay: React.FC<NodeLabelsDisplayProps> = ({
  nodeId,
  maxVisible = 3,
}) => {
  const labels = useNodeLabelStore((state) =>
    state.getLabelsForNode(nodeId)
  );

  const visibleLabels = useMemo(
    () => labels.slice(0, maxVisible),
    [labels, maxVisible]
  );

  const overflowCount = useMemo(
    () => Math.max(0, labels.length - maxVisible),
    [labels.length, maxVisible]
  );

  if (labels.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 0.5,
        flexWrap: "wrap",
        px: 1,
        pb: 1,
      }}
    >
      {visibleLabels.map((label) => (
        <Box
          key={label.id}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: `${label.color}30`,
            border: `1px solid ${label.color}60`,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: label.color,
            }}
          />
          <Box
            component="span"
            sx={{
              fontSize: "0.65rem",
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            {label.name}
          </Box>
        </Box>
      ))}
      {overflowCount > 0 && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontSize: "0.65rem",
            color: "text.secondary",
          }}
        >
          +{overflowCount} more
        </Box>
      )}
    </Box>
  );
};

export default NodeLabelsDisplay;
