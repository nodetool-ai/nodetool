/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Paper, Typography, List, Divider } from "@mui/material";
import { Task } from "../../stores/ApiTypes";
import SubTaskView from "./SubTaskView";

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

const TaskView: React.FC<TaskViewProps> = ({ task }) => {
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
        {task.subtasks.length > 0 && (
          <>
            <List disablePadding>
              {task.subtasks.map((subtask) => (
                <SubTaskView key={subtask.output_file} subtask={subtask} />
              ))}
            </List>
          </>
        )}
      </Paper>
    </div>
  );
};

export default TaskView;
