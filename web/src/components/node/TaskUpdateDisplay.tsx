/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Box, BORDER_RADIUS, MOTION, reducedMotion, getSpacingPx, SPACING } from "../ui_primitives";
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
      marginBottom: getSpacingPx(SPACING.lg),
      padding: getSpacingPx(SPACING.xl),
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.primary.dark}`,
      borderLeft: `3px solid ${theme.vars.palette.primary.main}`
    },

    ".task-header": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      marginBottom: getSpacingPx(SPACING.lg)
    },

    ".task-animated-heading": {
      animation: `aiColorShift ${MOTION.pulse} infinite`,
      ...reducedMotion({ animation: "none" }),
      fontFamily: theme.fontFamily1,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      flex: 1
    },

    ".task-event-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.xl,
      fontSize: "var(--fontSizeSmaller)",
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
      gap: getSpacingPx(SPACING.md)
    },

    ".task-title": {
      fontWeight: 600,
      fontSize: "var(--fontSizeNormal)",
      lineHeight: "1.4",
      color: theme.vars.palette.grey[100],
      marginBottom: getSpacingPx(SPACING.xs)
    },

    ".task-description": {
      fontSize: "var(--fontSizeSmall)",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[400],
      paddingLeft: getSpacingPx(SPACING.md),
      borderLeft: `2px solid ${theme.vars.palette.grey[700]}`
    },

    ".step-wrapper": {
      marginTop: getSpacingPx(SPACING.lg),
      paddingTop: getSpacingPx(SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".steps-section": {
      marginTop: getSpacingPx(SPACING.lg),
      paddingTop: getSpacingPx(SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.lg)
    },

    ".steps-header": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      letterSpacing: "1px",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
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

const getEventDisplayText = (
  t: (key: "i18n-next61.taskUpdate.events.taskCreated" | "i18n-next61.taskUpdate.events.stepStarted" | "i18n-next61.taskUpdate.events.enteredConclusion" | "i18n-next61.taskUpdate.events.maxIterationsReached" | "i18n-next61.taskUpdate.events.maxToolCallsReached" | "i18n-next61.taskUpdate.events.stepCompleted" | "i18n-next61.taskUpdate.events.stepFailed" | "i18n-next61.taskUpdate.events.taskCompleted" | "i18n-next61.taskUpdate.events.taskFailed") => string,
  event: string
): string => {
  switch (event) {
    case "task_created":
      return t("i18n-next61.taskUpdate.events.taskCreated");
    case "step_started":
      return t("i18n-next61.taskUpdate.events.stepStarted");
    case "entered_conclusion_stage":
      return t("i18n-next61.taskUpdate.events.enteredConclusion");
    case "max_iterations_reached":
      return t("i18n-next61.taskUpdate.events.maxIterationsReached");
    case "max_tool_calls_reached":
      return t("i18n-next61.taskUpdate.events.maxToolCallsReached");
    case "step_completed":
      return t("i18n-next61.taskUpdate.events.stepCompleted");
    case "step_failed":
      return t("i18n-next61.taskUpdate.events.stepFailed");
    case "task_completed":
      return t("i18n-next61.taskUpdate.events.taskCompleted");
    case "task_failed":
      return t("i18n-next61.taskUpdate.events.taskFailed");
    default:
      return event.replace(/_/g, " ");
  }
};

const TaskUpdateDisplay: React.FC<TaskUpdateDisplayProps> = ({
  taskUpdate
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
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
    <div className="task-update-container noscroll" css={cssStyles}>
      <div className="task-header">
        <Text className="task-animated-heading">
          {t("i18n-next61.taskUpdate.agentTask")}
        </Text>
        <span className="task-event-badge">
          {getEventDisplayText(t, taskUpdate.event)}
        </span>
      </div>

      {task && (
        <Box className="task-content">
          <Text className="task-title">
            {task.title}
          </Text>
          {task.description && (
            <Text className="task-description">
              {task.description}
            </Text>
          )}
        </Box>
      )}

      {task?.steps && task.steps.length > 0 && (
        <Box className="steps-section">
          <Text className="steps-header">
            {t("i18n-next61.taskUpdate.executionPlan")}
          </Text>
          {task.steps.map((step, idx) => {
            const isCurrent =
              currentStep &&
              (currentStep.id
                ? currentStep.id === step.id
                : currentStep.instructions === step.instructions);
            return (
              <StepView
                key={step.id ?? step.instructions ?? idx}
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
