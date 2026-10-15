/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  FlexColumn,
  FlexRow,
  Text,
  ScrollArea,
  LoadingSpinner,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  FONT_SIZE_SANS,
  getSpacingPx
} from "../../ui_primitives";
import type { TodoItem } from "../../../stores/ApiTypes";

const TODO_SIDEBAR_WIDTH = 280;

interface TodoSidebarProps {
  todos: TodoItem[];
}

const styles = (theme: Theme) =>
  css({
    width: TODO_SIDEBAR_WIDTH,
    flexShrink: 0,
    height: "100%",
    borderLeft: `1px solid ${theme.vars.palette.divider}`,
    // A 20% black rail reads as a grey slab on the light shell.
    background:
      theme.palette.mode === "light"
        ? theme.vars.palette.c_overlay_subtle
        : `rgb(${theme.vars.palette.common.blackChannel} / 0.20)`,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    ".todo-header": {
      padding: theme.spacing(4, 4, 3),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: getSpacingPx(SPACING.md)
    },
    ".todo-list": {
      flex: 1,
      minHeight: 0,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xs)}`
    },
    ".todo-item": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.md,
      display: "flex",
      alignItems: "flex-start",
      gap: getSpacingPx(SPACING.md),
      lineHeight: 1.35,
      transition: MOTION.background
    },
    ".todo-item + .todo-item": { marginTop: getSpacingPx(SPACING.micro) },
    ".todo-item.in_progress": {
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.10)`
    },
    ".todo-icon": {
      fontSize: FONT_SIZE_SANS.title,
      marginTop: theme.spacing(SPACING.micro),
      flexShrink: 0
    },
    ".todo-icon.pending": { color: theme.vars.palette.text.disabled },
    // The spinner sits in an icon-sized box so the text column lines up
    // with the pending and completed rows.
    ".todo-icon.in_progress": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "1em",
      height: "1em"
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
    }
  });

const STATUS_ICONS = {
  pending: RadioButtonUncheckedIcon,
  completed: CheckCircleIcon
} as const;

export const TodoSidebar: React.FC<TodoSidebarProps> = memo(({ todos }) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const counts = useMemo(() => todos.reduce(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 }
  ), [todos]);

  return (
    <aside className="todo-sidebar" css={cssStyles}>
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
              const Icon =
                todo.status === "in_progress" ? null : STATUS_ICONS[todo.status];
              return (
                <div key={`${i}-${todo.content}`} className={`todo-item ${todo.status}`}>
                  {Icon ? (
                    <Icon className={`todo-icon ${todo.status}`} />
                  ) : (
                    <span className="todo-icon in_progress">
                      <LoadingSpinner inline size={14} />
                    </span>
                  )}
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
