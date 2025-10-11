/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import {
  Message,
  PlanningUpdate,
  TaskUpdate,
  SubTaskResult
} from "../../../stores/ApiTypes";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import SubTaskView from "../../node/SubTaskView";
import SubTaskResultDisplay from "../../node/SubTaskResultDisplay";

const styles = (theme: Theme) =>
  css({
    "@keyframes aiColorShift": {
      "0%": { color: "#00FFFF" } /* Aqua */,
      "25%": { color: "#7B68EE" } /* MediumSlateBlue */,
      "50%": { color: "#AFEEEE" } /* PaleTurquoise */,
      "75%": { color: "#48D1CC" } /* MediumTurquoise */,
      "100%": { color: "#00FFFF" } /* Aqua */
    },

    ".agent-execution-container": {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    },

    ".consolidated-task-card": {
      marginBottom: "0.75rem",
      padding: "1rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.primary.dark}`,
      borderLeft: `3px solid ${theme.vars.palette.primary.main}`
    },

    ".task-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      marginBottom: "0.75rem"
    },

    ".task-animated-heading": {
      animation: "aiColorShift 4s infinite",
      fontFamily: theme.fontFamily1,
      fontSize: "0.75rem",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      flex: 1
    },

    ".task-status-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.25rem 0.625rem",
      borderRadius: "12px",
      fontSize: "0.6875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      backgroundColor: theme.vars.palette.primary.dark,
      color: theme.vars.palette.primary.light,
      border: `1px solid ${theme.vars.palette.primary.main}`
    },

    ".task-status-badge.completed": {
      backgroundColor: theme.vars.palette.success.dark,
      color: theme.vars.palette.success.light,
      border: `1px solid ${theme.vars.palette.success.main}`
    },

    ".task-status-badge.failed": {
      backgroundColor: theme.vars.palette.error.dark,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}`
    },

    ".task-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    },

    ".task-title": {
      fontWeight: 600,
      fontSize: "0.9375rem",
      lineHeight: "1.4",
      color: theme.vars.palette.grey[100],
      marginBottom: "0.25rem"
    },

    ".task-description": {
      fontSize: "0.8125rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[400],
      paddingLeft: "0.5rem",
      borderLeft: `2px solid ${theme.vars.palette.grey[700]}`
    },

    ".subtasks-section": {
      marginTop: "0.75rem",
      paddingTop: "0.75rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    },

    ".subtasks-header": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[400],
      letterSpacing: "0.5px",
      marginBottom: "0.25rem"
    },

    ".subtask-with-result": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    }
  });

interface AgentExecutionViewProps {
  messages: Message[];
}

interface ConsolidatedExecution {
  planningUpdate?: PlanningUpdate;
  taskUpdate?: TaskUpdate;
  subtaskResults: Map<string, SubTaskResult>;
  finalResult?: any;
  status: "planning" | "executing" | "completed" | "failed";
}

/**
 * Consolidates all agent execution messages by agent_execution_id into a single view.
 * This component groups planning updates, task updates, and subtask results together
 * to provide a clean, unified view of agent task execution.
 */
export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  messages
}) => {
  const theme = useTheme();

  // Consolidate all messages into a unified structure
  const execution = useMemo<ConsolidatedExecution>(() => {
    const result: ConsolidatedExecution = {
      subtaskResults: new Map(),
      status: "planning"
    };

    messages.forEach((msg) => {
      if (msg.role !== "agent_execution") return;

      const eventType = msg.execution_event_type;
      const content = msg.content as any;

      if (eventType === "planning_update") {
        result.planningUpdate = content as PlanningUpdate;
        result.status = "planning";
      } else if (eventType === "task_update") {
        result.taskUpdate = content as TaskUpdate;

        // Update status based on task event
        const taskEvent = (content as TaskUpdate).event;
        if (taskEvent === "task_completed") {
          result.status = "completed";
        } else if (taskEvent === "subtask_failed") {
          result.status = "failed";
        } else if (
          taskEvent === "subtask_started" ||
          taskEvent === "subtask_completed"
        ) {
          result.status = "executing";
        }
      } else if (eventType === "subtask_result") {
        const subtaskResult = content as SubTaskResult;
        // Use subtask content as key to match with task subtasks
        if (subtaskResult && result.taskUpdate?.subtask) {
          result.subtaskResults.set(
            result.taskUpdate.subtask.content,
            subtaskResult
          );
        }
      }
    });

    return result;
  }, [messages]);

  // If no task info yet, just show planning
  if (!execution.taskUpdate) {
    return (
      <li className="chat-message-list-item execution-event">
        <div className="agent-execution-container" css={styles(theme)}>
          {execution.planningUpdate && (
            <PlanningUpdateDisplay planningUpdate={execution.planningUpdate} />
          )}
        </div>
      </li>
    );
  }

  const task = execution.taskUpdate.task;
  const currentSubtask = execution.taskUpdate.subtask;

  // Determine overall status badge
  const getStatusBadgeClass = () => {
    if (execution.status === "completed") return "completed";
    if (execution.status === "failed") return "failed";
    return "";
  };

  const getStatusText = () => {
    if (execution.status === "completed") return "Completed";
    if (execution.status === "failed") return "Failed";
    if (execution.status === "executing") return "In Progress";
    return "Planning";
  };

  return (
    <li className="chat-message-list-item execution-event">
      <div className="agent-execution-container" css={styles(theme)}>
        {/* Show planning update if available */}
        {execution.planningUpdate && (
          <PlanningUpdateDisplay planningUpdate={execution.planningUpdate} />
        )}

        {/* Consolidated task card */}
        <div className="consolidated-task-card noscroll">
          <div className="task-header">
            <Typography className="task-animated-heading">
              Agent Task
            </Typography>
            <span className={`task-status-badge ${getStatusBadgeClass()}`}>
              {getStatusText()}
            </span>
          </div>

          {task && (
            <Box className="task-content">
              <Typography className="task-title">{task.title}</Typography>
              {task.description && (
                <Typography className="task-description">
                  {task.description}
                </Typography>
              )}
            </Box>
          )}

          {/* Subtasks section - show all subtasks from the task */}
          {task?.subtasks && task.subtasks.length > 0 && (
            <Box className="subtasks-section">
              <Typography className="subtasks-header">Subtasks</Typography>
              {task.subtasks.map((subtask, index) => {
                const subtaskResult = execution.subtaskResults.get(
                  subtask.content
                );
                const isCurrent =
                  currentSubtask && currentSubtask.content === subtask.content;

                return (
                  <div key={index} className="subtask-with-result">
                    <SubTaskView
                      subtask={{
                        ...subtask,
                        // Mark as running if it's the current subtask and not completed
                        start_time: isCurrent && !subtask.completed ? 1 : 0
                      }}
                    />
                    {subtaskResult && (
                      <SubTaskResultDisplay subtaskResult={subtaskResult} />
                    )}
                  </div>
                );
              })}
            </Box>
          )}

          {/* Show current subtask if it's not in the task.subtasks list */}
          {currentSubtask &&
            (!task?.subtasks ||
              !task.subtasks.some(
                (s) => s.content === currentSubtask.content
              )) && (
              <Box className="subtasks-section">
                <Typography className="subtasks-header">
                  Current Subtask
                </Typography>
                <SubTaskView subtask={currentSubtask} />
              </Box>
            )}
        </div>
      </div>
    </li>
  );
};

export default AgentExecutionView;
