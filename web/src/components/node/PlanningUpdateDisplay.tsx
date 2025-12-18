/** @jsxImportSource @emotion/react */
import React, { useState, useMemo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { Button, Typography, css } from "@mui/material";

interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

const styles = (theme: Theme) =>
  css({
    ".planning-update-container": {
      marginBottom: "0.25rem",
      padding: "1rem",
      borderRadius: "12px",
      backgroundColor: `rgba(25, 25, 30, 0.5)`,
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: `rgba(35, 35, 40, 0.7)`,
        borderColor: theme.vars.palette.secondary.dark
      }
    },

    ".planning-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      marginBottom: "0.5rem"
    },

    ".ai-label": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: "1px",
      textTransform: "uppercase",
      color: theme.vars.palette.secondary.light,
      opacity: 0.8
    },

    ".planning-status-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.15rem 0.6rem",
      borderRadius: "15px",
      fontSize: "0.6rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      backgroundColor: `${theme.vars.palette.secondary.main}15`,
      color: theme.vars.palette.secondary.light,
      border: `1px solid ${theme.vars.palette.secondary.main}30`
    },

    ".planning-status-badge.failed": {
      backgroundColor: `${theme.vars.palette.error.main}15`,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}30`
    },

    ".planning-content": {
      fontSize: "0.85rem",
      lineHeight: "1.6",
      color: theme.vars.palette.grey[300],
      "& p": {
        margin: "0.5em 0"
      }
    },

    ".show-more-button": {
      marginTop: "0.5rem",
      fontSize: "0.65rem",
      height: "24px",
      textTransform: "uppercase",
      fontWeight: 700,
      borderRadius: "6px",
      borderOpacity: 0.3
    }
  });

const PLANNING_CONTENT_TRUNCATE_LENGTH = 200; // Max characters before truncating

const PlanningUpdateDisplay: React.FC<PlanningUpdateDisplayProps> = ({
  planningUpdate
}) => {
  const theme = useTheme();
  const [showFullPlanningContent, setShowFullPlanningContent] = useState(false);

  const toggleShowFullPlanningContent = useCallback(() => {
    setShowFullPlanningContent(!showFullPlanningContent);
  }, [showFullPlanningContent]);

  const truncatedPlanningContent = useMemo(() => {
    if (!planningUpdate?.content) return null;
    if (planningUpdate.content.length <= PLANNING_CONTENT_TRUNCATE_LENGTH) {
      return planningUpdate.content;
    }
    return (
      planningUpdate.content.slice(0, PLANNING_CONTENT_TRUNCATE_LENGTH) + "..."
    );
  }, [planningUpdate?.content]);

  const isFailed = planningUpdate.status === "Failed";

  return (
    <div className="planning-update-container noscroll" css={styles(theme)}>
      <div className="planning-header">
        <Typography className="ai-label">
          {planningUpdate.phase}
        </Typography>
        <span className={`planning-status-badge ${isFailed ? "failed" : ""}`}>
          {planningUpdate.status}
        </span>
      </div>

      {truncatedPlanningContent && (
        <>
          <div className="planning-content">
            <MarkdownRenderer
              content={
                showFullPlanningContent
                  ? planningUpdate.content!
                  : truncatedPlanningContent
              }
            />
          </div>
          {planningUpdate.content &&
            planningUpdate.content.length >
              PLANNING_CONTENT_TRUNCATE_LENGTH && (
              <Button
                variant="outlined"
                size="small"
                onClick={toggleShowFullPlanningContent}
                className="show-more-button"
              >
                {showFullPlanningContent ? "Show less" : "Show more"}
              </Button>
            )}
        </>
      )}
    </div>
  );
};

export default React.memo(PlanningUpdateDisplay);
