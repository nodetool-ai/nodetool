/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Paper, Typography, List } from "@mui/material";
import { Task } from "../../stores/ApiTypes";
import StepView from "./StepView";

const styles = (theme: Theme) =>
  css({
    ".task-container": {
      marginBottom: "1rem",
      padding: "1rem",
      borderRadius: "4px"
    },
    ".task-title": {
      fontWeight: "bold",
      color: theme.vars.palette.grey[200]
    },
    ".task-description": {
      marginTop: "0.5rem",
      marginBottom: "1rem",
      color: theme.vars.palette.grey[800]
    }
  });

interface TaskViewProps {
  task: Task;
}

const TaskView: React.FC<TaskViewProps> = React.memo(({ task }) => {
  const theme = useTheme();
  return (
    <div css={styles(theme)} className="noscroll">
      <Paper className="task-container" elevation={1}>
        <Typography variant="h6" className="task-title">
          Task: {task.title}
        </Typography>
        {task.description && (
          <Typography variant="body2" className="task-description">
            {task.description}
          </Typography>
        )}
        {task.steps.length > 0 && (
          <>
            <List disablePadding>
              {task.steps.map((step) => (
                <StepView key={step.id} step={step} />
              ))}
            </List>
          </>
        )}
      </Paper>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for Task objects
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.title === nextProps.task.title &&
    prevProps.task.description === nextProps.task.description &&
    prevProps.task.steps.length === nextProps.task.steps.length &&
    prevProps.task.steps.every((step, i) => {
      const nextStep = nextProps.task.steps[i];
      return (
        step.id === nextStep.id &&
        step.instructions === nextStep.instructions &&
        step.completed === nextStep.completed &&
        step.start_time === nextStep.start_time
      );
    })
  );
});

TaskView.displayName = "TaskView";

export default TaskView;
