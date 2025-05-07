/** @jsxImportSource @emotion/react */
import React, { useState, useMemo, useCallback } from "react";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { Button, css } from "@mui/material";

interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

const styles = (theme: any) =>
  css({
    "@keyframes aiColorShift": {
      "0%": { color: "#00FFFF" } /* Aqua */,
      "25%": { color: "#7B68EE" } /* MediumSlateBlue */,
      "50%": { color: "#AFEEEE" } /* PaleTurquoise */,
      "75%": { color: "#48D1CC" } /* MediumTurquoise */,
      "100%": { color: "#00FFFF" } /* Aqua */
    },

    ".ai-animated-heading": {
      animation: "aiColorShift 4s infinite",
      fontFamily: theme.fontFamily1,
      fontSize: "0.8rem"
    }
  });

const PLANNING_CONTENT_TRUNCATE_LENGTH = 200; // Max characters before truncating

const PlanningUpdateDisplay: React.FC<PlanningUpdateDisplayProps> = ({
  planningUpdate
}) => {
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

  if (planningUpdate.status === "Failed") {
    return (
      <div className="planning-update-container" css={styles}>
        <h3 className="ai-animated-heading">
          {planningUpdate.phase} <em>{planningUpdate.status}</em>
        </h3>
      </div>
    );
  }
  if (planningUpdate.status === "Success") {
    return null;
  }
  return (
    <div className="planning-update-container" css={styles}>
      <h3 className="ai-animated-heading">
        {planningUpdate.phase} <em>{planningUpdate.status}</em>
      </h3>
      {truncatedPlanningContent && (
        <>
          <MarkdownRenderer
            content={
              showFullPlanningContent
                ? planningUpdate.content!
                : truncatedPlanningContent
            }
          />
          {planningUpdate.content &&
            planningUpdate.content.length >
              PLANNING_CONTENT_TRUNCATE_LENGTH && (
              <Button
                variant="outlined"
                onClick={toggleShowFullPlanningContent}
                style={{ marginTop: "5px" }}
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
