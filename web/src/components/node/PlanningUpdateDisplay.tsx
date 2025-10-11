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
    "@keyframes aiColorShift": {
      "0%": { color: "#00FFFF" } /* Aqua */,
      "25%": { color: "#7B68EE" } /* MediumSlateBlue */,
      "50%": { color: "#AFEEEE" } /* PaleTurquoise */,
      "75%": { color: "#48D1CC" } /* MediumTurquoise */,
      "100%": { color: "#00FFFF" } /* Aqua */
    },

    ".planning-update-container": {
      marginBottom: "0.75rem",
      padding: "1rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.secondary.dark}`,
      borderLeft: `3px solid ${theme.vars.palette.secondary.main}`
    },

    ".planning-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      marginBottom: "0.75rem"
    },

    ".ai-animated-heading": {
      animation: "aiColorShift 4s infinite",
      fontFamily: theme.fontFamily1,
      fontSize: "0.75rem",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      flex: 1
    },

    ".planning-status-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.25rem 0.625rem",
      borderRadius: "12px",
      fontSize: "0.6875rem",
      fontWeight: 600,
      fontStyle: "normal",
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      backgroundColor: theme.vars.palette.secondary.dark,
      color: theme.vars.palette.secondary.light,
      border: `1px solid ${theme.vars.palette.secondary.main}`
    },

    ".planning-status-badge.failed": {
      backgroundColor: theme.vars.palette.error.dark,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}`
    },

    ".planning-content": {
      fontSize: "0.875rem",
      lineHeight: "1.6",
      color: theme.vars.palette.grey[200],
      "& p": {
        margin: "0.5em 0",
        "&:first-of-type": {
          marginTop: 0
        },
        "&:last-of-type": {
          marginBottom: 0
        }
      },
      "& ul, & ol": {
        margin: "0.5em 0",
        paddingLeft: "1.5em"
      },
      "& li": {
        margin: "0.25em 0"
      },
      "& code": {
        backgroundColor: theme.vars.palette.grey[800],
        padding: "0.125em 0.375em",
        borderRadius: "3px",
        fontSize: "0.875em",
        fontFamily: theme.fontFamily2 || "monospace"
      }
    },

    ".show-more-button": {
      marginTop: "0.75rem",
      fontSize: "0.75rem",
      textTransform: "uppercase",
      fontWeight: 600,
      letterSpacing: "0.5px"
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
        <Typography className="ai-animated-heading">
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
