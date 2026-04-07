/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { css } from "@mui/material";

interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

const styles = (theme: Theme) =>
  css({
    "&.planning-item": {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      width: "100%"
    },

    ".planning-name": {
      fontSize: "0.7rem",
      fontWeight: 700,
      color: theme.vars.palette.info.light,
      letterSpacing: "0.3px",
      textTransform: "lowercase"
    },

    ".planning-message": {
      fontSize: "0.65rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: "1.3"
    }
  });

const PLANNING_CONTENT_TRUNCATE_LENGTH = 180;

const PlanningUpdateDisplay: React.FC<PlanningUpdateDisplayProps> = ({
  planningUpdate
}) => {
  const theme = useTheme();
  const trimmedContent = planningUpdate?.content?.trim() || "";
  const truncatedContent =
    trimmedContent.length > PLANNING_CONTENT_TRUNCATE_LENGTH
      ? trimmedContent.slice(0, PLANNING_CONTENT_TRUNCATE_LENGTH) + "..."
      : trimmedContent;

  return (
    <div className="planning-item" css={styles(theme)}>
      <span className="planning-name">{planningUpdate.phase}</span>
      {truncatedContent && (
        <span className="planning-message">{truncatedContent}</span>
      )}
    </div>
  );
};

export default React.memo(PlanningUpdateDisplay);
