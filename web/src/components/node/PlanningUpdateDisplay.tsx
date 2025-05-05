import React, { useState, useMemo, useCallback } from "react";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { Button } from "@mui/material";
interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

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

  return (
    <div className="planning-update-container">
      <h3>
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
