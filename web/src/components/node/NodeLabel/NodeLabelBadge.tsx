/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { Box, Chip, Tooltip } from "@mui/material";
import { useNodeLabelStore, NodeLabel } from "../../../stores/NodeLabelStore";

interface NodeLabelBadgeProps {
  nodeId: string;
  maxVisible?: number;
}

const badgeStyles = css`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 4px;
  max-width: 100%;
  overflow: hidden;

  & .label-badge {
    font-size: 10px;
    font-weight: 500;
    height: 18px;
    line-height: 18px;
    padding: 0 6px;
    border-radius: 9px;
    cursor: pointer;
    transition: transform 0.1s ease, opacity 0.1s ease;
    white-space: nowrap;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      transform: scale(1.05);
      opacity: 0.9;
    }
  }

  & .label-more {
    font-size: 10px;
    font-weight: 600;
    height: 18px;
    min-width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background-color: rgba(128, 128, 128, 0.3);
    color: inherit;
    cursor: pointer;
  }
`;

const NodeLabelBadge: React.FC<NodeLabelBadgeProps> = memo(({ nodeId, maxVisible = 3 }) => {
  const labels = useNodeLabelStore((state) => state.getLabels(nodeId));
  const removeLabel = useNodeLabelStore((state) => state.removeLabel);
  const [expanded, setExpanded] = useState(false);

  const visibleLabels = expanded ? labels : labels.slice(0, maxVisible);
  const remainingCount = labels.length - maxVisible;

  const handleBadgeClick = useCallback(
    (_e: React.MouseEvent, _label: NodeLabel) => {
      // Placeholder for future click interaction
    },
    []
  );

  const handleBadgeDelete = useCallback(
    (e: React.MouseEvent, labelId: string) => {
      e.stopPropagation();
      removeLabel(nodeId, labelId);
    },
    [nodeId, removeLabel]
  );

  if (labels.length === 0) {
    return null;
  }

  return (
    <Box css={badgeStyles} className="node-label-badges">
      {visibleLabels.slice(0, maxVisible).map((label) => (
        <Tooltip key={label.id} title={label.text} arrow>
          <Chip
            label={label.text}
            size="small"
            className="label-badge"
            onClick={(e) => handleBadgeClick(e, label)}
            onDelete={(e) => handleBadgeDelete(e, label.id)}
            deleteIcon={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  color: "inherit",
                  "&:hover": {
                    backgroundColor: "rgba(0,0,0,0.5)",
                  },
                }}
              >
                ×
              </Box>
            }
            sx={{
              backgroundColor: label.color,
              color: getContrastColor(label.color),
              border: "none",
              "& .MuiChip-label": {
                padding: "0 4px",
              },
              "& .MuiChip-deleteIcon": {
                margin: 0,
                padding: 0,
                color: "inherit",
                opacity: 0.7,
                "&:hover": {
                  opacity: 1,
                },
              },
            }}
          />
        </Tooltip>
      ))}
      {!expanded && remainingCount > 0 && (
        <Chip
          label={`+${remainingCount}`}
          size="small"
          className="label-more"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          sx={{
            backgroundColor: "action.hover",
            color: "text.secondary",
          }}
        />
      )}
    </Box>
  );
});

NodeLabelBadge.displayName = "NodeLabelBadge";

function getContrastColor(hexColor: string): string {
  if (!hexColor) {
    return "#000000";
  }

  let hex = hexColor.replace("#", "");

  if (hex.length === 3) {
    hex = hex.split("").map((char) => char + char).join("");
  }

  if (hex.length !== 6) {
    return "#000000";
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return "#000000";
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export default NodeLabelBadge;
