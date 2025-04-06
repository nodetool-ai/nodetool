/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import { Typography } from "@mui/material";
import { TaskPlan, Task, SubTask } from "../../stores/ApiTypes";
import TaskView from "./TaskView";

interface TaskPlanViewProps {
  data: Task[] | { type: "task_plan"; title: string; tasks: Task[] };
}

const styles = (theme: any) =>
  css({
    ".task-list-title": {
      margin: "1rem 1rem",
      fontWeight: "bold",
      fontSize: "1rem"
    }
  });

const TaskPlanView: React.FC<TaskPlanViewProps> = ({ data }) => {
  const { tasks, title } = useMemo(() => {
    // Handle either array of tasks or a task_plan object
    if (Array.isArray(data)) {
      return { tasks: data, title: undefined };
    } else {
      return { tasks: data.tasks, title: data.title };
    }
  }, [data]);

  return (
    <div css={styles}>
      {title && (
        <Typography variant="h5" className="task-list-title">
          {title}
        </Typography>
      )}
      {tasks.map((task, index) => (
        <TaskView key={index} task={task} />
      ))}
    </div>
  );
};

export default TaskPlanView;
