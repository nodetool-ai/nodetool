/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState } from "react";
import Tooltip from "@mui/material/Tooltip";
import { Notes } from "@mui/icons-material";

interface AnnotationBadgeProps {
  nodeId: string;
  annotation: string | undefined;
}

const badgeStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "20px",
  height: "20px",
  borderRadius: "4px",
  backgroundColor: "rgba(255, 193, 7, 0.2)",
  color: "#ffc107",
  cursor: "pointer",
  flexShrink: 0,
  transition: "all 0.2s ease",
  "&:hover": {
    backgroundColor: "rgba(255, 193, 7, 0.4)",
    transform: "scale(1.1)"
  }
});

const tooltipStyles = css({
  maxWidth: "300px",
  wordWrap: "break-word",
  whiteSpace: "pre-wrap"
});

export const AnnotationBadge: React.FC<AnnotationBadgeProps> = memo(
  function AnnotationBadge({ nodeId: _nodeId, annotation }) {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    if (!annotation || !annotation.trim()) {
      return null;
    }

    const truncatedAnnotation =
      annotation.length > 100
        ? annotation.substring(0, 100) + "..."
        : annotation;

    return (
      <Tooltip
        title={
          <div css={tooltipStyles}>
            <div>{truncatedAnnotation}</div>
          </div>
        }
        placement="top"
        open={tooltipOpen}
        onOpen={() => setTooltipOpen(true)}
        onClose={() => setTooltipOpen(false)}
        arrow
      >
        <div css={badgeStyles}>
          <Notes sx={{ fontSize: 14 }} />
        </div>
      </Tooltip>
    );
  }
);
