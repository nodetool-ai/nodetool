/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { FlexColumn, FlexRow, Text, ScrollArea, MOTION, BORDER_RADIUS } from "../../ui_primitives";
import type { TodoItem } from "../../../stores/ApiTypes";

export const TODO_SIDEBAR_WIDTH = 280;

interface TodoSidebarProps {
  todos: TodoItem[];
}

const styles = (theme: Theme) =>
  css({
    width: TODO_SIDEBAR_WIDTH,
    flexShrink: 0,
    height: "100%",
    borderLeft: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
    background: `rgb(${theme.vars.palette.common.blackChannel} / 0.20)`,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    ".todo-header": {
      padding: theme.spacing(4, 4, 3),
      borderBottom: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8
    },
    ".todo-list": {
      flex: 1,
      minHeight: 0,
      padding: "8px 4px"
    },
    ".todo-item": {
      padding: "8px 12px",
      borderRadius: BORDER_RADIUS.md,
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      lineHeight: 1.35,
      transition: MOTION.background
    },
    ".todo-item + .todo-item": { marginTop: 2 },
    ".todo-item.in_progress": {
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.10)`
    },
    ".todo-icon": {
      fontSize: 18,
      marginTop: theme.spacing(0.5),
      flexShrink: 0
    },
    ".todo-icon.pending": { color: `rgb(${theme.vars.palette.common.whiteChannel} / 0.45)` },
    ".todo-icon.in_progress": {
      color: theme.vars.palette.primary.main,
      animation: "spin 1.8s linear infinite"
    },
    ".todo-icon.completed": { color: theme.vars.palette.success.main },
    ".todo-text": {
      flex: 1,
      minWidth: 0,
      wordBreak: "break-word"
    },
    ".todo-text.completed": {
      textDecoration: "line-through",
      opacity: 0.55
    },
    ".empty-state": {
      padding: theme.spacing(8, 6),
      textAlign: "center",
      opacity: 0.55
    },
    "@keyframes spin": {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" }
    }
  });

const STATUS_ICONS = {
  pending: RadioButtonUncheckedIcon,
  in_progress: AutorenewIcon,
  completed: CheckCircleIcon
} as const;

export const TodoSidebar: React.FC<TodoSidebarProps> = memo(({ todos }) => {
  const theme = useTheme();
  const counts = todos.reduce(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 }
  );

  return (
    <aside className="todo-sidebar" css={styles(theme)}>
      <FlexRow className="todo-header" align="baseline" justify="space-between">
        <Text
          size="small"
          weight={600}
          sx={{ letterSpacing: 0.6, textTransform: "uppercase" }}
        >
          Tasks
        </Text>
        {todos.length > 0 && (
          <Text size="smaller" sx={{ opacity: 0.6 }}>
            {counts.completed}/{todos.length}
          </Text>
        )}
      </FlexRow>
      <ScrollArea className="todo-list">
        {todos.length === 0 ? (
          <div className="empty-state">
            <Text size="small">
              No tasks yet. The agent will list its plan here as it works.
            </Text>
          </div>
        ) : (
          <FlexColumn gap={0}>
            {todos.map((todo, i) => {
              const Icon = STATUS_ICONS[todo.status];
              return (
                <div key={todo.content || i} className={`todo-item ${todo.status}`}>
                  <Icon className={`todo-icon ${todo.status}`} />
                  <Text size="small" className={`todo-text ${todo.status}`}>
                    {todo.content}
                  </Text>
                </div>
              );
            })}
          </FlexColumn>
        )}
      </ScrollArea>
    </aside>
  );
});

TodoSidebar.displayName = "TodoSidebar";
