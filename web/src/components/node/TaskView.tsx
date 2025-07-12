/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { Paper, Typography, List, Divider } from "@mui/material";
import { Task, SubTask } from "../../stores/ApiTypes";
import SubTaskView from "./SubTaskView";

const styles = (theme: Theme) =>
  css({
    ".task-container": {
      marginBottom: "1rem",
      padding: "1rem",
      borderRadius: "4px",
      backgroundColor: theme.palette.grey[800]
    },
    ".task-title": {
      fontWeight: "bold",
      color: theme.palette.grey[800]
    },
    ".task-description": {
      marginTop: "0.5rem",
      marginBottom: "1rem",
      color: theme.palette.grey[800]
    }
  });

interface TaskViewProps {
  task: Task;
}

const TaskView: React.FC<TaskViewProps> = ({ task }) => {
  return (
    <div css={styles} className="noscroll">
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
            <Divider sx={{ my: 1 }} />
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
