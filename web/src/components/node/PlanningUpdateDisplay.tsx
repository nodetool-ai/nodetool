/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { Typography, css } from "@mui/material";

interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

const styles = (theme: Theme) =>
  css({
    ".planning-update-container": {
      position: "relative",
      marginBottom: "0.5rem",
      padding: "0.85rem 1rem",
      borderRadius: "12px",
      backgroundColor: `rgba(20, 22, 28, 0.4)`,
      border: `1px solid ${theme.vars.palette.grey[800]}44`,
      transition: "all 0.2s ease"
    },

    ".planning-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      marginBottom: "0.35rem"
    },

    ".planning-phase": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.7rem",
      fontWeight: 700,
      letterSpacing: "1px",
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },

    ".planning-status": {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "10px",
      fontSize: "0.6rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[400],
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },

    ".planning-status.success": {
      backgroundColor: `${theme.vars.palette.success.main}15`,
      color: theme.vars.palette.success.light,
      border: `1px solid ${theme.vars.palette.success.main}33`
    },

    ".planning-status.failed": {
      backgroundColor: `${theme.vars.palette.error.main}15`,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}33`
    },

    ".planning-status.in-progress": {
       backgroundColor: `${theme.vars.palette.primary.main}15`,
       color: theme.vars.palette.primary.light,
       border: `1px solid ${theme.vars.palette.primary.main}33`
    },

    ".planning-content": {
      marginTop: "0.25rem",
      fontSize: "0.8rem",
      lineHeight: "1.6",
      color: theme.vars.palette.grey[300],
      "& p": {
        margin: "0.25em 0"
      },
      // Make markdown content slightly muted but readable
       opacity: 0.95
    }
  });

const PLANNING_CONTENT_TRUNCATE_LENGTH = 180;

const PlanningUpdateDisplay: React.FC<PlanningUpdateDisplayProps> = ({
  planningUpdate
}) => {
  const theme = useTheme();
  // Optional: maybe show full content if it is the LAST update? 
  // For now stick to truncation strategy but maybe increase length or make it dynamic.
  const trimmedContent = planningUpdate?.content?.trim() || "";
  const truncatedPlanningContent =
    trimmedContent.length > PLANNING_CONTENT_TRUNCATE_LENGTH
      ? trimmedContent.slice(0, PLANNING_CONTENT_TRUNCATE_LENGTH) + "..."
      : trimmedContent;
  
  const statusLower = planningUpdate.status?.toLowerCase() || "";
  const statusClass =
    statusLower === "failed"
      ? "failed"
      : statusLower === "success"
      ? "success"
      : "in-progress";

  return (
    <div className="planning-update-container noscroll" css={styles(theme)}>
      <div className="planning-row">
        <Typography className="planning-phase">
          {planningUpdate.phase}
        </Typography>
        <span className={`planning-status ${statusClass}`}>
          {planningUpdate.status}
        </span>
      </div>

      {truncatedPlanningContent && (
        <div className="planning-content">
          <MarkdownRenderer content={truncatedPlanningContent} />
        </div>
      )}
    </div>
  );
};

export default React.memo(PlanningUpdateDisplay);
