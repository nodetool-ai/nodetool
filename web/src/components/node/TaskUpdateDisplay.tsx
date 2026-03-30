/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box } from "@mui/material";
import { TaskUpdate } from "../../stores/ApiTypes";
import StepView from "./StepView";

const styles = (theme: Theme) =>
  css({
    "@keyframes aiColorShift": {
      "0%": { color: theme.vars.palette.info.main },
      "25%": { color: theme.vars.palette.secondary.main },
      "50%": { color: theme.vars.palette.info.light },
      "75%": { color: theme.vars.palette.primary.light },
      "100%": { color: theme.vars.palette.info.main }
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

    ".step-wrapper": {
      marginTop: "0.75rem",
      paddingTop: "0.75rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".steps-section": {
      marginTop: "0.75rem",
      paddingTop: "0.75rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    },

    ".steps-header": {
      fontSize: "0.7rem",
      fontWeight: 700,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      letterSpacing: "1px",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      "&::after": {
        content: '""',
        flex: 1,
        height: "1px",
        backgroundColor: theme.vars.palette.grey[800]
      }
    }
  });

interface TaskUpdateDisplayProps {
  taskUpdate: TaskUpdate;
}

const getEventDisplayText = (event: string): string => {
  switch (event) {
    case "task_created":
      return "Task Created";
    case "step_started":
      return "Step Started";
    case "entered_conclusion_stage":
      return "Entering Conclusion";
    case "max_iterations_reached":
      return "Max Iterations Reached";
    case "max_tool_calls_reached":
      return "Max Tool Calls Reached";
    case "step_completed":
      return "Step Completed";
    case "step_failed":
      return "Step Failed";
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
  const task = taskUpdate.task;
  const currentStep = taskUpdate.step;
  const currentStepInPlan =
    !!currentStep &&
    !!task?.steps &&
    task.steps.some((step) =>
      currentStep.id
        ? step.id === currentStep.id
        : step.instructions === currentStep.instructions
    );
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

      {task && (
        <Box className="task-content">
          <Typography className="task-title">
            {task.title}
          </Typography>
          {task.description && (
            <Typography className="task-description">
              {task.description}
            </Typography>
          )}
        </Box>
      )}

      {task?.steps && task.steps.length > 0 && (
        <Box className="steps-section">
          <Typography className="steps-header">Execution Plan</Typography>
          {task.steps.map((step, idx) => {
            const isCurrent =
              currentStep &&
              (currentStep.id
                ? currentStep.id === step.id
                : currentStep.instructions === step.instructions);
            return (
              <StepView
                key={`${step.id || step.instructions}-${idx}`}
                step={{
                  ...step,
                  start_time:
                    step.start_time || (isCurrent && !step.completed ? 1 : 0)
                }}
              />
            );
          })}
        </Box>
      )}

      {currentStep && (!task?.steps || !currentStepInPlan) && (
        <Box className="step-wrapper">
          <StepView step={currentStep} />
        </Box>
      )}
    </div>
  );
};

export default React.memo(TaskUpdateDisplay);
