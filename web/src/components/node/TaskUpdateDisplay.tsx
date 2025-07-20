/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
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
      marginBottom: "0.5rem",
      padding: "0.75rem",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`
    },

    ".task-animated-heading": {
      animation: "aiColorShift 4s infinite",
      fontFamily: theme.fontFamily1,
      fontSize: "0.8rem",
      marginBottom: "0.5rem"
    },

    ".task-title": {
      fontWeight: 600,
      marginBottom: "0.25rem",
      color: theme.vars.palette.text.primary
    },

    ".task-event": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "capitalize",
      marginLeft: "0.5rem"
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
  return (
    <div className="task-update-container noscroll" css={styles}>
      <Typography variant="h6" className="task-animated-heading">
        Agent Task
        <span className="task-event">
          {getEventDisplayText(taskUpdate.event)}
        </span>
      </Typography>

      {taskUpdate.task && (
        <Box>
          <Typography variant="body2" className="task-title">
            {taskUpdate.task.title}
          </Typography>
          {taskUpdate.task.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.7rem", mt: 0.25 }}
            >
              {taskUpdate.task.description}
            </Typography>
          )}
        </Box>
      )}

      {taskUpdate.subtask && (
        <Box sx={{ mt: 1 }}>
          <SubTaskView subtask={taskUpdate.subtask} />
        </Box>
      )}
    </div>
  );
};

export default React.memo(TaskUpdateDisplay);
