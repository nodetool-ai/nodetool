/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Card, ListGroup, BORDER_RADIUS, getSpacingPx, SPACING } from "../ui_primitives";
import { Task } from "../../stores/ApiTypes";
import StepView from "./StepView";

const styles = (theme: Theme) =>
  css({
    ".task-container": {
      marginBottom: getSpacingPx(SPACING.xl),
      padding: getSpacingPx(SPACING.xl),
      borderRadius: BORDER_RADIUS.sm
    },
    ".task-title": {
      fontWeight: 600,
      color: theme.vars.palette.grey[200]
    },
    ".task-description": {
      marginTop: getSpacingPx(SPACING.md),
      marginBottom: getSpacingPx(SPACING.xl),
      color: theme.vars.palette.grey[800]
    }
  });

interface TaskViewProps {
  task: Task;
}

const TaskView: React.FC<TaskViewProps> = memo(({ task }) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  return (
    <div css={cssStyles} className="noscroll">
      <Card className="task-container" variant="elevated" elevation={1}>
        <Text size="normal" weight={600} className="task-title">
          Task: {task.title}
        </Text>
        {task.description && (
          <Text size="small" className="task-description">
            {task.description}
          </Text>
        )}
        {task.steps && task.steps.length > 0 && (
          <>
            <ListGroup flush>
              {task.steps?.map((step) => (
                <StepView key={step.id} step={step} />
              ))}
            </ListGroup>
          </>
        )}
      </Card>
    </div>
  );
});

TaskView.displayName = "TaskView";

export default TaskView;
