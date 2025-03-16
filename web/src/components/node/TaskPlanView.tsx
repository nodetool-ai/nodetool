/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Chip,
  Collapse,
  Box,
  Divider
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import BuildIcon from "@mui/icons-material/Build";
import { TaskPlan, Task, SubTask } from "../../stores/ApiTypes";

interface TaskPlanViewProps {
  data: Task[] | { type: "task_plan"; title: string; tasks: Task[] };
}

const styles = (theme: any) =>
  css({
    ".task-container": {
      marginBottom: "1rem",
      padding: "1rem",
      borderRadius: "4px",
      backgroundColor: theme.palette.c_gray1
    },
    ".task-title": {
      fontWeight: "bold",
      color: theme.palette.c_gray10
    },
    ".task-description": {
      marginTop: "0.5rem",
      marginBottom: "1rem",
      color: theme.palette.c_gray10
    },
    ".subtask-item": {
      padding: "0.5rem",
      marginBottom: "0.5rem",
      borderLeft: `2px solid ${theme.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".subtask-content": {
      display: "flex",
      alignItems: "center"
    },
    ".subtask-completed": {
      color: theme.palette.c_gray10
    },
    ".subtask-tool svg": {
      fontSize: "0.5rem"
    },
    ".subtask-tool": {
      marginLeft: "0.5rem",
      fontSize: "0.5rem"
    },
    ".dependency-marker": {
      display: "flex",
      color: theme.palette.text.secondary,
      marginLeft: "2rem"
    },
    ".task-list-title": {
      margin: "1rem 1rem",
      fontWeight: "bold",
      fontSize: "1rem"
    }
  });

const SubTaskView: React.FC<{
  subtask: SubTask;
  allSubtasks: Record<string, SubTask>;
}> = ({ subtask, allSubtasks }) => {
  const [expanded, setExpanded] = React.useState(false);
  const hasDependencies = subtask.dependencies.length > 0;

  return (
    <Paper className="subtask-item" elevation={0}>
      <div className="subtask-content">
        <Checkbox checked={subtask.completed} disabled size="small" />
        <ListItemText
          primary={
            <Typography
              variant="body1"
              className={subtask.completed ? "subtask-completed" : ""}
            >
              {subtask.content}
            </Typography>
          }
        />
        {subtask.tool && (
          <Chip
            icon={<BuildIcon />}
            label={subtask.tool}
            className="subtask-tool"
            size="small"
          />
        )}
        {hasDependencies && (
          <Box
            ml={1}
            onClick={() => setExpanded(!expanded)}
            sx={{ cursor: "pointer" }}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
        )}
      </div>

      {hasDependencies && (
        <Collapse in={expanded}>
          <Box ml={3} mt={1}>
            <List dense disablePadding>
              {subtask.dependencies.map((depId) => (
                <ListItem key={depId} dense disablePadding>
                  <div className="dependency-marker">
                    &rarr;&nbsp;
                    {allSubtasks[depId]?.content ||
                      `Unknown dependency (${depId})`}
                  </div>
                </ListItem>
              ))}
            </List>
          </Box>
        </Collapse>
      )}
    </Paper>
  );
};

const TaskView: React.FC<{
  task: Task;
  allSubtasks: Record<string, SubTask>;
}> = ({ task, allSubtasks }) => {
  return (
    <Paper className="task-container" elevation={1}>
      <Typography variant="h6" className="task-title">
        {task.title}
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
              <SubTaskView
                key={subtask.id}
                subtask={subtask}
                allSubtasks={allSubtasks}
              />
            ))}
          </List>
        </>
      )}
    </Paper>
  );
};

const TaskPlanView: React.FC<TaskPlanViewProps> = ({ data }) => {
  const { tasks, title } = useMemo(() => {
    // Handle either array of tasks or a task_plan object
    if (Array.isArray(data)) {
      return { tasks: data, title: undefined };
    } else {
      return { tasks: data.tasks, title: data.title };
    }
  }, [data]);

  // Create a map of all subtasks for dependency lookup
  const allSubtasks = useMemo(() => {
    const map: Record<string, SubTask> = {};
    tasks.forEach((task) => {
      task.subtasks.forEach((subtask) => {
        map[subtask.id] = subtask;
      });
    });
    return map;
  }, [tasks]);

  return (
    <div css={styles}>
      {title && (
        <Typography variant="h5" className="task-list-title">
          {title}
        </Typography>
      )}
      {tasks.map((task, index) => (
        <TaskView key={index} task={task} allSubtasks={allSubtasks} />
      ))}
    </div>
  );
};

export default TaskPlanView;
