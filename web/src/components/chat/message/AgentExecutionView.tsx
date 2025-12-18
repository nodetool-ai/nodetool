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
  StepResult
} from "../../../stores/ApiTypes";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import StepView from "../../node/StepView";
import StepResultDisplay from "../../node/StepResultDisplay";

const styles = (theme: Theme) =>
  css({
    "@keyframes aiGlow": {
      "0%": { boxShadow: `0 0 5px ${theme.vars.palette.primary.main}44` },
      "50%": { boxShadow: `0 0 15px ${theme.vars.palette.primary.main}88` },
      "100%": { boxShadow: `0 0 5px ${theme.vars.palette.primary.main}44` }
    },

    ".agent-execution-container": {
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem",
      position: "relative",
      paddingLeft: "1.5rem",
      "&::before": {
        content: '""',
        position: "absolute",
        left: "4px",
        top: "10px",
        bottom: "10px",
        width: "2px",
        background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main}44)`,
        borderRadius: "1px"
      }
    },

    ".planning-phases-section": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      marginBottom: "0.5rem"
    },

    ".consolidated-task-card": {
      position: "relative",
      marginBottom: "1rem",
      padding: "1.25rem",
      borderRadius: "12px",
      backgroundColor: `rgba(15, 15, 20, 0.7)`,
      backdropFilter: "blur(8px)",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
      transition: "all 0.3s ease",
      "&.executing": {
        animation: "aiGlow 3s infinite ease-in-out",
        borderColor: `${theme.vars.palette.primary.main}66`
      },
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
        borderRadius: "12px 12px 0 0"
      }
    },

    ".task-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      marginBottom: "1rem"
    },

    ".task-label": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.7rem",
      fontWeight: 700,
      letterSpacing: "1px",
      textTransform: "uppercase",
      color: theme.vars.palette.primary.light,
      opacity: 0.8
    },

    ".task-status-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.2rem 0.75rem",
      borderRadius: "20px",
      fontSize: "0.65rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      backgroundColor: `${theme.vars.palette.primary.main}22`,
      color: theme.vars.palette.primary.light,
      border: `1px solid ${theme.vars.palette.primary.main}44`
    },

    ".task-status-badge.completed": {
      backgroundColor: `${theme.vars.palette.success.main}22`,
      color: theme.vars.palette.success.light,
      border: `1px solid ${theme.vars.palette.success.main}44`
    },

    ".task-status-badge.failed": {
      backgroundColor: `${theme.vars.palette.error.main}22`,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}44`
    },

    ".task-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    },

    ".task-title": {
      fontWeight: 700,
      fontSize: "1.1rem",
      lineHeight: "1.3",
      color: "#fff",
      textShadow: "0 2px 4px rgba(0,0,0,0.3)"
    },

    ".task-description": {
      fontSize: "0.85rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[400],
      fontStyle: "italic",
      marginBottom: "0.5rem"
    },

    ".steps-section": {
      marginTop: "1.25rem",
      paddingTop: "1.25rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    },

    ".steps-header": {
      fontSize: "0.7rem",
      fontWeight: 700,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      letterSpacing: "1px",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginBottom: "0.25rem",
      "&::after": {
        content: '""',
        flex: 1,
        height: "1px",
        backgroundColor: theme.vars.palette.grey[800]
      }
    },

    ".step-with-result": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      transition: "transform 0.2s ease"
    },

    ".timeline-dot": {
      position: "absolute",
      left: "-21px",
      top: "12px",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.primary.main,
      border: `2px solid ${theme.vars.palette.background.default}`,
      boxShadow: `0 0 10px ${theme.vars.palette.primary.main}aa`,
      zIndex: 2
    },
    ".log-entry": {
      fontSize: "0.8rem",
      padding: "0.5rem 0.75rem",
      borderRadius: "8px",
      backgroundColor: `rgba(30, 35, 40, 0.4)`,
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      color: theme.vars.palette.grey[300],
      fontFamily: theme.fontFamily2 || "monospace",
      marginBottom: "0.5rem"
    },

    ".log-severity-error": {
      borderColor: `${theme.vars.palette.error.main}44`,
      color: theme.vars.palette.error.light
    },

    ".log-severity-warning": {
      borderColor: `${theme.vars.palette.warning.main}44`,
      color: theme.vars.palette.warning.light
    }
  });

interface AgentExecutionViewProps {
  messages: Message[];
}

interface TimelineItem {
  type: "planning" | "task" | "log";
  data: any;
  key: string;
}

interface ConsolidatedExecution {
  timeline: TimelineItem[];
  stepResults: Map<string, StepResult>;
  status: "planning" | "executing" | "completed" | "failed";
}

/**
 * Consolidates all agent execution messages by agent_execution_id into a single view.
 * This component groups planning updates, task updates, and subtask results together
 * to provide a clean, unified view of agent task execution.
 * 
 * All planning phases are displayed persistently to show the full execution history.
 */
export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  messages
}) => {
  const theme = useTheme();

  const execution = useMemo<ConsolidatedExecution>(() => {
    const result: ConsolidatedExecution = {
      timeline: [],
      stepResults: new Map(),
      status: "planning"
    };

    const seenPlanningPhases = new Set<string>();
    const seenTasks = new Map<string, number>(); // task_id or instructions -> index in timeline

    messages.forEach((msg, msgIndex) => {
      if (msg.role !== "agent_execution") return;

      const eventType = msg.execution_event_type;
      const content = msg.content as any;

      if (eventType === "planning_update") {
        const planningUpdate = content as PlanningUpdate;
        const phaseKey = `planning-${planningUpdate.phase}-${planningUpdate.status}`;
        
        if (!seenPlanningPhases.has(phaseKey)) {
          seenPlanningPhases.add(phaseKey);
          result.timeline.push({
            type: "planning",
            data: planningUpdate,
            key: `planning-${msgIndex}`
          });
        }
        
        if (planningUpdate.status === "Failed") result.status = "failed";
      } else if (eventType === "task_update") {
        const taskUpdate = content as TaskUpdate;
        const task = taskUpdate.task;
        const taskIdentifier = task?.id || task?.title || (taskUpdate.step?.instructions);
        
        if (taskIdentifier) {
          if (seenTasks.has(taskIdentifier)) {
            // Update existing task entry
            const index = seenTasks.get(taskIdentifier)!;
            result.timeline[index].data = taskUpdate;
          } else {
            // New task entry
            seenTasks.set(taskIdentifier, result.timeline.length);
            result.timeline.push({
              type: "task",
              data: taskUpdate,
              key: `task-${msgIndex}`
            });
          }
        }

        const taskEvent = taskUpdate.event;
        if (taskEvent === "task_completed") result.status = "completed";
        else if (taskEvent === "step_failed") result.status = "failed";
        else if (taskEvent === "step_started") result.status = "executing";
      } else if (eventType === "step_result") {
        const stepResult = content as StepResult;
        // Collect all step results to be merged into task views
        const stepId = stepResult?.step?.id || stepResult?.step?.instructions;
        if (stepId) {
           result.stepResults.set(stepId, stepResult);
        }
      } else if (eventType === "log_update") {
        result.timeline.push({
          type: "log",
          data: content,
          key: `log-${msgIndex}`
        });
      }
    });

    return result;
  }, [messages]);

  const renderTimelineItem = (item: TimelineItem) => {
    switch (item.type) {
      case "planning":
        return (
          <div key={item.key} style={{ position: "relative" }}>
            <div className="timeline-dot" />
            <PlanningUpdateDisplay planningUpdate={item.data} />
          </div>
        );
      case "log":
        return (
          <div key={item.key} style={{ position: "relative" }}>
            <div className="timeline-dot" style={{ width: 6, height: 6, left: -19, top: 14, opacity: 0.6 }} />
            <div className={`log-entry log-severity-${item.data.severity || "info"}`}>
              {item.data.content}
            </div>
          </div>
        );
      case "task": {
        const taskUpdate = item.data as TaskUpdate;
        const task = taskUpdate.task;
        const currentStep = taskUpdate.step;
        
        const getStatusBadgeClass = () => {
          if (taskUpdate.event === "task_completed") return "completed";
          if (taskUpdate.event === "step_failed") return "failed";
          return "";
        };

        const getStatusText = () => {
          if (taskUpdate.event === "task_completed") return "Completed";
          if (taskUpdate.event === "step_failed") return "Failed";
          return "In Progress";
        };

        return (
          <div key={item.key} className={`consolidated-task-card noscroll ${execution.status === "executing" ? "executing" : ""}`}>
            <div className="timeline-dot" />
            <div className="task-header">
              <Typography className="task-label">Agent Task</Typography>
              <span className={`task-status-badge ${getStatusBadgeClass()}`}>
                {getStatusText()}
              </span>
            </div>

            {task && (
              <Box className="task-content">
                <Typography className="task-title">{task.title}</Typography>
                {task.description && (
                  <Typography className="task-description">{task.description}</Typography>
                )}
              </Box>
            )}

            {task?.steps && task.steps.length > 0 && (
              <Box className="steps-section">
                <Typography className="steps-header">Execution Plan</Typography>
                {task.steps.map((step, idx) => {
                  const stepResult = execution.stepResults.get(step.id || step.instructions);
                  const isCurrent = currentStep && currentStep.instructions === step.instructions;

                  return (
                    <div key={idx} className="step-with-result">
                      <StepView
                        step={{
                          ...step,
                          start_time: isCurrent && !step.completed ? 1 : 0
                        }}
                      />
                      {stepResult && <StepResultDisplay stepResult={stepResult} />}
                    </div>
                  );
                })}
              </Box>
            )}

            {currentStep && (!task?.steps || !task.steps.some(s => s.instructions === currentStep.instructions)) && (
              <Box className="steps-section">
                <Typography className="steps-header">Internal Step</Typography>
                <StepView step={currentStep} />
              </Box>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <li className="chat-message-list-item execution-event">
      <div className="agent-execution-container" css={styles(theme)}>
        {execution.timeline.map(renderTimelineItem)}
      </div>
    </li>
  );
};

export default AgentExecutionView;
