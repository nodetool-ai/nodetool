/** @jsxImportSource @emotion/react */
/**
 * The agent's task list, docked on top of the composer.
 *
 * Collapsed it is one line: the task the agent is on, how many are done, and
 * a progress track. Expanding it unfolds the full list upward. It replaces
 * the fixed-width right rails, which squeezed the conversation on narrow
 * windows and had to swap places with it on phones.
 */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  BORDER_RADIUS,
  Collapse,
  FONT_SIZE_SANS,
  LoadingSpinner,
  MOTION,
  SPACING,
  ScrollArea,
  Text,
  getSpacingPx,
  reducedMotion
} from "../../ui_primitives";
import type { TaskUpdate, TodoItem } from "../../../stores/ApiTypes";

/** Tall enough for about eight rows before the list scrolls. */
const LIST_MAX_HEIGHT = "min(40vh, 320px)";
const PROGRESS_TRACK_WIDTH = 48;
const PROGRESS_TRACK_HEIGHT = 3;
const SPINNER_SIZE = 14;

export interface TaskDockList {
  /** Heading for the expanded list, when the tasks belong to a named task. */
  title?: string;
  description?: string;
  items: TodoItem[];
}

/**
 * The list the dock shows. The running agent task wins over the thread's todo
 * list, matching the rail it replaces. Agent steps map onto todo statuses.
 */
export const buildTaskDockList = (
  todos: readonly TodoItem[],
  taskUpdate: TaskUpdate | null | undefined
): TaskDockList => {
  if (!taskUpdate) {
    return { items: [...todos] };
  }
  const { task, step: currentStep } = taskUpdate;
  const isCurrent = (step: { id?: string; instructions?: string }): boolean =>
    Boolean(currentStep) &&
    (currentStep?.id
      ? currentStep.id === step.id
      : currentStep?.instructions === step.instructions);
  const steps = task?.steps ?? [];
  const items: TodoItem[] = steps.map((step) => ({
    content: step.instructions ?? step.name ?? "",
    status:
      step.completed || step.status === "completed"
        ? "completed"
        : isCurrent(step)
          ? "in_progress"
          : "pending"
  }));
  if (currentStep && !steps.some(isCurrent)) {
    items.push({
      content: currentStep.instructions ?? currentStep.name ?? "",
      status: currentStep.completed ? "completed" : "in_progress"
    });
  }
  return {
    title: task?.title ?? task?.name,
    description: task?.description,
    items: items.filter((item) => item.content.length > 0)
  };
};

/** The task to show on the collapsed bar: running, else next, else last. */
export const currentTaskIndex = (items: readonly TodoItem[]): number => {
  const running = items.findIndex((item) => item.status === "in_progress");
  if (running >= 0) {
    return running;
  }
  const next = items.findIndex((item) => item.status === "pending");
  return next >= 0 ? next : items.length - 1;
};

const styles = (theme: Theme) =>
  css({
    // A tab that slides out of the composer's top edge: inset from the
    // composer's corners, open at the bottom so the two read as one object.
    width: `calc(100% - ${getSpacingPx(SPACING.xxl)} * 2)`,
    alignSelf: "center",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderRadius: `${BORDER_RADIUS.xl} ${BORDER_RADIUS.xl} 0 0`,
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    borderBottom: "none",
    background: theme.vars.palette.background.paper,
    [theme.getColorSchemeSelector("dark")]: {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderBottom: "none",
      background: theme.vars.palette.background.default
    },
    overflow: "hidden",
    [theme.breakpoints.down("sm")]: {
      width: `calc(100% - ${getSpacingPx(SPACING.lg)} * 2)`
    },

    ".task-dock-bar": {
      all: "unset",
      boxSizing: "border-box",
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      cursor: "pointer",
      color: theme.vars.palette.text.primary,
      transition: MOTION.background,
      "&:hover": { background: theme.vars.palette.c_overlay_subtle },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },
    ".task-dock-current": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".task-dock-count": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums"
    },
    ".task-dock-track": {
      flexShrink: 0,
      width: PROGRESS_TRACK_WIDTH,
      height: PROGRESS_TRACK_HEIGHT,
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.divider,
      overflow: "hidden"
    },
    ".task-dock-fill": {
      height: "100%",
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.primary.main,
      transition: `width ${MOTION.slow}`,
      ...reducedMotion({ transition: "none" })
    },
    ".task-dock-fill.done": { background: theme.vars.palette.success.main },
    ".task-dock-chevron": {
      flexShrink: 0,
      fontSize: FONT_SIZE_SANS.title,
      color: theme.vars.palette.text.secondary,
      transition: MOTION.transform,
      ...reducedMotion({ transition: "none" })
    },
    "&.expanded .task-dock-chevron": { transform: "rotate(180deg)" },

    ".task-dock-list": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xs)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".task-dock-heading": {
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.md)}`
    },
    ".task-dock-description": {
      color: theme.vars.palette.text.secondary,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".task-dock-item": {
      display: "flex",
      alignItems: "flex-start",
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.md,
      lineHeight: 1.35
    },
    ".task-dock-item.in_progress": {
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.10)`
    },
    ".task-dock-icon": {
      flexShrink: 0,
      fontSize: FONT_SIZE_SANS.body,
      marginTop: getSpacingPx(SPACING.micro),
      // The spinner sits in an icon-sized box so every row's text lines up.
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "1em",
      height: "1em"
    },
    ".task-dock-icon.pending": { color: theme.vars.palette.text.disabled },
    ".task-dock-icon.completed": { color: theme.vars.palette.success.main },
    ".task-dock-text": { flex: 1, minWidth: 0, wordBreak: "break-word" },
    ".task-dock-text.completed": {
      textDecoration: "line-through",
      opacity: 0.55
    }
  });

const StatusIcon = ({ status }: { status: TodoItem["status"] }) => {
  if (status === "in_progress") {
    return (
      <span className="task-dock-icon in_progress">
        <LoadingSpinner inline size={SPINNER_SIZE} />
      </span>
    );
  }
  const Icon = status === "completed" ? CheckCircleIcon : RadioButtonUncheckedIcon;
  return <Icon className={`task-dock-icon ${status}`} />;
};

interface TaskDockProps {
  todos: readonly TodoItem[];
  /** The running agent task, shown instead of the todos while it runs. */
  taskUpdate?: TaskUpdate | null;
  /** Start unfolded. For previews; the chat starts collapsed. */
  defaultExpanded?: boolean;
}

export const TaskDock = memo(
  ({ todos, taskUpdate, defaultExpanded = false }: TaskDockProps) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const [expanded, setExpanded] = useState(defaultExpanded);
    const listId = useId();
    const currentRowRef = useRef<HTMLDivElement>(null);

    const list = useMemo(
      () => buildTaskDockList(todos, taskUpdate),
      [todos, taskUpdate]
    );
    const { items } = list;
    const currentIndex = currentTaskIndex(items);
    const current = items[currentIndex];
    const completed = items.filter((item) => item.status === "completed").length;
    const allDone = items.length > 0 && completed === items.length;

    const toggle = useCallback(() => setExpanded((open) => !open), []);

    // Unfolding a long list lands on the task the agent is on.
    useEffect(() => {
      if (expanded) {
        currentRowRef.current?.scrollIntoView?.({ block: "nearest" });
      }
    }, [expanded, currentIndex]);

    if (!current) {
      return null;
    }

    const toggleLabel = expanded
      ? t("i18n-next23.chat.taskDock.collapse")
      : t("i18n-next23.chat.taskDock.expand");

    return (
      <section
        className={`task-dock${expanded ? " expanded" : ""}`}
        css={cssStyles}
        aria-label={t("i18n-next23.chat.taskDock.label")}
      >
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <ScrollArea id={listId} className="task-dock-list" maxHeight={LIST_MAX_HEIGHT} thin>
            {(list.title || list.description) && (
              <div className="task-dock-heading">
                {list.title && (
                  <Text size="small" weight={600}>
                    {list.title}
                  </Text>
                )}
                {list.description && (
                  <Text size="smaller" className="task-dock-description">
                    {list.description}
                  </Text>
                )}
              </div>
            )}
            {items.map((item, i) => (
              <div
                key={`${i}-${item.content}`}
                ref={i === currentIndex ? currentRowRef : undefined}
                className={`task-dock-item ${item.status}`}
                aria-current={i === currentIndex && !allDone ? "step" : undefined}
              >
                <StatusIcon status={item.status} />
                <Text size="small" className={`task-dock-text ${item.status}`}>
                  {item.content}
                </Text>
              </div>
            ))}
          </ScrollArea>
        </Collapse>
        <button
          type="button"
          className="task-dock-bar"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          title={toggleLabel}
        >
          <StatusIcon status={allDone ? "completed" : current.status} />
          <Text size="small" className="task-dock-current">
            {allDone ? t("i18n-next23.chat.taskDock.allDone") : current.content}
          </Text>
          <Text size="smaller" className="task-dock-count">
            {completed}/{items.length}
          </Text>
          {/* The count beside it carries the same progress for screen readers. */}
          <span className="task-dock-track" aria-hidden>
            <span
              className={`task-dock-fill${allDone ? " done" : ""}`}
              style={{ display: "block", width: `${Math.round((completed / items.length) * 100)}%` }}
            />
          </span>
          <ExpandLessIcon className="task-dock-chevron" aria-hidden />
        </button>
      </section>
    );
  }
);

TaskDock.displayName = "TaskDock";
