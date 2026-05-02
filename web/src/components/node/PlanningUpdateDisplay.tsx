/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { PlanningUpdate } from "../../stores/ApiTypes";
import { css } from "@emotion/react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AutorenewIcon from "@mui/icons-material/Autorenew";

interface PlanningUpdateDisplayProps {
  planningUpdate: PlanningUpdate;
}

const styles = (theme: Theme) =>
  css({
    "&.planning-item": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      width: "100%",
      padding: "0.15rem 0"
    },

    ".planning-icon": {
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      color: theme.vars.palette.success.main,
      "& svg": { fontSize: "0.85rem" },
      "&.active svg": {
        color: theme.vars.palette.primary.main,
        animation: "spin 1.5s linear infinite"
      }
    },

    "@keyframes spin": {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" }
    },

    ".planning-name": {
      fontSize: "0.7rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "capitalize",
      minWidth: "5rem"
    },

    ".planning-message": {
      fontSize: "0.65rem",
      color: theme.vars.palette.text.disabled,
      lineHeight: "1.3",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  });

const PLANNING_CONTENT_TRUNCATE_LENGTH = 120;

const PlanningUpdateDisplay: React.FC<PlanningUpdateDisplayProps> = ({
  planningUpdate
}) => {
  const theme = useTheme();
  const trimmedContent = planningUpdate?.content?.trim() || "";
  const truncatedContent =
    trimmedContent.length > PLANNING_CONTENT_TRUNCATE_LENGTH
      ? trimmedContent.slice(0, PLANNING_CONTENT_TRUNCATE_LENGTH) + "..."
      : trimmedContent;

  const isComplete =
    planningUpdate.status === "Success" ||
    planningUpdate.phase === "complete";
  const isActive = !isComplete && planningUpdate.status !== "Failed";

  return (
    <div className="planning-item" css={styles(theme)}>
      <span className={`planning-icon ${isActive ? "active" : ""}`}>
        {isComplete ? (
          <CheckCircleOutlineIcon />
        ) : (
          <AutorenewIcon />
        )}
      </span>
      <span className="planning-name">{planningUpdate.phase}</span>
      {truncatedContent && (
        <span className="planning-message">{truncatedContent}</span>
      )}
    </div>
  );
};

export default React.memo(PlanningUpdateDisplay);
