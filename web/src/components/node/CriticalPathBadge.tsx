/**
 * Critical Path Badge Component
 *
 * Visual indicator showing that a node is on the critical execution path.
 * Displays as a colored badge with a timing icon.
 *
 * @experimental
 */

import React, { memo } from "react";
import { Box, Tooltip } from "@mui/material";
import { Speed as SpeedIcon } from "@mui/icons-material";

export interface CriticalPathBadgeProps {
  /** Whether this node is on the critical path */
  isCritical: boolean;
  /** Position of the badge (top-left, top-right, etc.) */
  position?: "top-left" | "top-right";
}

/**
 * Critical Path Badge Component
 *
 * Shows a visual indicator when a node is on the critical execution path.
 */
const CriticalPathBadge: React.FC<CriticalPathBadgeProps> = memo(
  function CriticalPathBadge({ isCritical, position = "top-left" }) {
    if (!isCritical) {
      return null;
    }

    const positionStyles = {
      "top-left": {
        top: -8,
        left: -8
      },
      "top-right": {
        top: -8,
        right: -8
      }
    };

    return (
      <Tooltip
        title="This node is on the critical execution path"
        placement="top"
        arrow
      >
        <Box
          sx={{
            position: "absolute",
            ...positionStyles[position],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "warning.main",
            border: 2,
            borderColor: "warning.dark",
            zIndex: 1000,
            boxShadow: 1
          }}
        >
          <SpeedIcon
            sx={{
              fontSize: 12,
              color: "warning.contrastText"
            }}
          />
        </Box>
      </Tooltip>
    );
  }
);

export default CriticalPathBadge;
