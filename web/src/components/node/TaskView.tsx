/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { List } from "@mui/material";
import { Text, Card } from "../ui_primitives";
import { Task } from "../../stores/ApiTypes";
import StepView from "./StepView";

const styles = (theme: Theme) =>
  css({
    ".task-container": {
      marginBottom: "1rem",
      padding: "1rem",
      borderRadius: "var(--rounded-sm)"
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

const TaskView: React.FC<TaskViewProps> = ({ task }) => {
  const theme = useTheme();
  return (
    <div css={styles(theme)} className="noscroll">
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
            <List disablePadding>
              {task.steps?.map((step) => (
                <StepView key={step.id} step={step} />
              ))}
            </List>
          </>
        )}
      </Card>
    </div>
  );
};

export default TaskView;
