/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();

    return (
      <FlexColumn
        component="aside"
        aria-label={t("i18n-next54.sidebar.activeTask")}
        className="task-update-sidebar"
        fullHeight
        sx={{
          width: TASK_SIDEBAR_WIDTH,
          flexShrink: 0,
          minHeight: 0,
          borderLeft: `1px solid ${theme.vars.palette.divider}`,
          background: `rgb(${theme.vars.palette.common.blackChannel} / 0.20)`,
          ...theme.applyStyles("light", {
            background: theme.vars.palette.c_overlay_subtle
          })
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
