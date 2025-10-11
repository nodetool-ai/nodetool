/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box } from "@mui/material";
import { TaskUpdate } from "../../stores/ApiTypes";
import SubTaskView from "./SubTaskView";

const styles = (theme: Theme) =>
  css({
    "@keyframes aiColorShift": {
      "0%": { color: "#00FFFF" } /* Aqua */,
      "25%": { color: "#7B68EE" } /* MediumSlateBlue */,
      "50%": { color: "#AFEEEE" } /* PaleTurquoise */,
      "75%": { color: "#48D1CC" } /* MediumTurquoise */,
      "100%": { color: "#00FFFF" } /* Aqua */
    },

    ".task-update-container": {
      marginBottom: "0.75rem",
      padding: "1rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.primary.dark}`,
      borderLeft: `3px solid ${theme.vars.palette.primary.main}`
    },

    ".task-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      marginBottom: "0.75rem"
    },

    ".task-animated-heading": {
      animation: "aiColorShift 4s infinite",
      fontFamily: theme.fontFamily1,
      fontSize: "0.75rem",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      flex: 1
    },

    ".task-event-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.25rem 0.625rem",
      borderRadius: "12px",
      fontSize: "0.6875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      backgroundColor: theme.vars.palette.primary.dark,
      color: theme.vars.palette.primary.light,
      border: `1px solid ${theme.vars.palette.primary.main}`
    },

    ".task-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    },

    ".task-title": {
      fontWeight: 600,
      fontSize: "0.9375rem",
      lineHeight: "1.4",
      color: theme.vars.palette.grey[100],
      marginBottom: "0.25rem"
    },

    ".task-description": {
      fontSize: "0.8125rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[400],
      paddingLeft: "0.5rem",
      borderLeft: `2px solid ${theme.vars.palette.grey[700]}`
    },

    ".subtask-wrapper": {
      marginTop: "0.75rem",
      paddingTop: "0.75rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    }
  });

interface TaskUpdateDisplayProps {
  taskUpdate: TaskUpdate;
}

const getEventDisplayText = (event: string): string => {
  switch (event) {
    case "task_created":
      return "Task Created";
    case "subtask_started":
      return "Subtask Started";
    case "entered_conclusion_stage":
      return "Entering Conclusion";
    case "max_iterations_reached":
      return "Max Iterations Reached";
    case "max_tool_calls_reached":
      return "Max Tool Calls Reached";
    case "subtask_completed":
      return "Subtask Completed";
    case "subtask_failed":
      return "Subtask Failed";
    case "task_completed":
      return "Task Completed";
    default:
      return event.replace(/_/g, " ");
  }
};

const TaskUpdateDisplay: React.FC<TaskUpdateDisplayProps> = ({
  taskUpdate
}) => {
  const theme = useTheme();
  return (
    <div className="task-update-container noscroll" css={styles(theme)}>
      <div className="task-header">
        <Typography className="task-animated-heading">
          Agent Task
        </Typography>
        <span className="task-event-badge">
          {getEventDisplayText(taskUpdate.event)}
        </span>
      </div>

      {taskUpdate.task && (
        <Box className="task-content">
          <Typography className="task-title">
            {taskUpdate.task.title}
          </Typography>
          {taskUpdate.task.description && (
            <Typography className="task-description">
              {taskUpdate.task.description}
            </Typography>
          )}
        </Box>
      )}

      {taskUpdate.subtask && (
        <Box className="subtask-wrapper">
          <SubTaskView subtask={taskUpdate.subtask} />
        </Box>
      )}
    </div>
  );
};

export default React.memo(TaskUpdateDisplay);
