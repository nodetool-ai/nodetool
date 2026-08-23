/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { TaskUpdate } from "../../../stores/ApiTypes";
import TaskUpdateDisplay from "../../node/TaskUpdateDisplay";
import { FlexColumn, ScrollArea, SPACING } from "../../ui_primitives";

const TASK_SIDEBAR_WIDTH = 360;

interface TaskUpdateSidebarProps {
  taskUpdate: TaskUpdate;
}

/** Desktop right rail for the task that the agent is currently running. */
export const TaskUpdateSidebar = memo<TaskUpdateSidebarProps>(
  ({ taskUpdate }) => {
    const theme = useTheme();

    return (
      <FlexColumn
        component="aside"
        aria-label="Active agent task"
        className="task-update-sidebar"
        fullHeight
        sx={{
          width: TASK_SIDEBAR_WIDTH,
          flexShrink: 0,
          minHeight: 0,
          borderLeft: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
          background: `rgb(${theme.vars.palette.common.blackChannel} / 0.20)`
        }}
      >
        <ScrollArea fullHeight padding={SPACING.lg}>
          <TaskUpdateDisplay taskUpdate={taskUpdate} />
        </ScrollArea>
      </FlexColumn>
    );
  }
);

TaskUpdateSidebar.displayName = "TaskUpdateSidebar";
