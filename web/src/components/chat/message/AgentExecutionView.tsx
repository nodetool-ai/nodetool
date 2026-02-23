/** @jsxImportSource @emotion/react */
import React, { useMemo, useState, memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Collapse } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  Message,
  PlanningUpdate,
  TaskUpdate,
  StepResult
} from "../../../stores/ApiTypes";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import PlanningUpdateDisplay from "../../node/PlanningUpdateDisplay";
import StepView from "../../node/StepView";
import StepResultDisplay from "../../node/StepResultDisplay";

const styles = (theme: Theme) =>
  css({
    "@keyframes aiGlow": {
      "0%": { boxShadow: `0 0 5px ${theme.vars.palette.primary.main}22` },
      "50%": { boxShadow: `0 0 20px ${theme.vars.palette.primary.main}44` },
      "100%": { boxShadow: `0 0 5px ${theme.vars.palette.primary.main}22` }
    },

    ".agent-execution-container": {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      position: "relative",
      paddingLeft: "1.75rem",
      "&::before": {
        content: '""',
        position: "absolute",
        left: "6px",
        top: "14px",
        bottom: "14px",
        width: "2px",
        background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}44, ${theme.vars.palette.secondary.main}22, transparent)`,
        borderRadius: "1px"
      }
    },

    ".consolidated-task-card": {
      position: "relative",
      marginBottom: "1.5rem",
      borderRadius: "16px",
      backgroundColor: theme.vars.palette.background.paper,
      backdropFilter: "blur(12px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows?.[4] || "0 4px 12px rgba(0, 0, 0, 0.2)",
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      "&.executing": {
        animation: "aiGlow 4s infinite ease-in-out",
        borderColor: `${theme.vars.palette.primary.main}55`
      },
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "1px",
        background: `linear-gradient(90deg, transparent, ${theme.vars.palette.primary.main}44, transparent)`,
        opacity: 0.3
      }
    },

    ".task-header-section": {
      padding: "1rem 1.25rem",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}88`,
      background: "transparent"
    },

    ".task-header-top": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      marginBottom: "0.5rem"
    },

    ".task-label": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color: theme.vars.palette.primary.main,
      opacity: 0.9,
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      "&::before": {
        content: '""',
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: "currentColor",
        boxShadow: "0 0 8px currentColor"
      }
    },

    ".task-status-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.15rem 0.6rem",
      borderRadius: "12px",
      fontSize: "0.6rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      backgroundColor: `${theme.vars.palette.primary.main}15`,
      color: theme.vars.palette.primary.light,
      border: `1px solid ${theme.vars.palette.primary.main}33`,
      boxShadow: `0 0 10px ${theme.vars.palette.primary.main}11`
    },

    ".task-status-badge.completed": {
      backgroundColor: `${theme.vars.palette.success.main}15`,
      color: theme.vars.palette.success.light,
      border: `1px solid ${theme.vars.palette.success.main}33`,
      boxShadow: `0 0 10px ${theme.vars.palette.success.main}11`
    },

    ".task-status-badge.failed": {
      backgroundColor: `${theme.vars.palette.error.main}15`,
      color: theme.vars.palette.error.light,
      border: `1px solid ${theme.vars.palette.error.main}33`,
      boxShadow: `0 0 10px ${theme.vars.palette.error.main}11`
    },

    ".task-title": {
      fontWeight: 600,
      fontSize: "1rem",
      lineHeight: "1.4",
      color: theme.vars.palette.text.primary,
      letterSpacing: "0.2px",
      marginBottom: "0.25rem"
    },

    ".task-description": {
      fontSize: "0.8rem",
      lineHeight: "1.5",
      color: theme.vars.palette.text.secondary,
      fontStyle: "normal",
      maxWidth: "95%"
    },

    ".steps-container": {
      padding: "1rem 1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem"
    },

    ".section-label": {
      fontSize: "0.65rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      letterSpacing: "1px",
      marginBottom: "0.75rem",
      display: "block"
    },

    ".step-wrapper": {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    },

    ".timeline-dot": {
      position: "absolute",
      left: "-22px",
      top: "24px",
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.background.default,
      border: `2px solid ${theme.vars.palette.primary.main}`,
      boxShadow: `0 0 12px ${theme.vars.palette.primary.main}66`,
      zIndex: 2,
      "&.completed": {
        borderColor: theme.vars.palette.success.main,
        boxShadow: `0 0 12px ${theme.vars.palette.success.main}66`
      },
      "&.failed": {
        borderColor: theme.vars.palette.error.main,
        boxShadow: `0 0 12px ${theme.vars.palette.error.main}66`
      }
    },

    ".log-entry": {
      fontSize: "0.75rem",
      padding: "0.5rem 0.75rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2 || "monospace",
      marginBottom: "0.5rem",
      marginLeft: "0.5rem",
      borderLeft: `2px solid ${theme.vars.palette.grey[700]}`
    },

    ".tool-calls-container": {
      marginLeft: "1rem",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      overflow: "hidden"
    },

    ".tool-calls-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.4rem 0.75rem",
      cursor: "pointer",
      userSelect: "none",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },

    ".tool-calls-title": {
      fontSize: "0.65rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },

    ".tool-calls-count": {
      padding: "1px 6px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.6rem"
    },

    ".tool-calls-list": {
      padding: "0.5rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.4rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}66`
    },

    ".tool-call-item": {
      display: "flex",
      flexDirection: "column",
      gap: "0.35rem",
      padding: "0.5rem 0.6rem",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.action.active
      }
    },

    ".tool-call-header-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: "0.6rem",
      width: "100%"
    },

    ".tool-call-status-dot": {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      marginTop: "5px",
      flexShrink: 0,
      backgroundColor: theme.vars.palette.grey[600],
      "&.running": {
        backgroundColor: theme.vars.palette.info.main,
        boxShadow: `0 0 6px ${theme.vars.palette.info.main}66`
      },
      "&.completed": {
        backgroundColor: theme.vars.palette.success.main,
        opacity: 0.6
      }
    },

    ".tool-call-content": {
      flex: 1,
      minWidth: 0
    },

    ".tool-name": {
      fontSize: "0.7rem",
      fontWeight: 700,
      color: theme.vars.palette.info.light,
      letterSpacing: "0.3px",
      display: "block",
      marginBottom: "2px"
    },

    ".tool-message": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: "1.3"
    },

    ".tool-args": {
      marginTop: "0.25rem",
      padding: "0.4rem",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "0.65rem",
      lineHeight: "1.4",
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2 || "monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    }
  });

const formatToolArgs = (args: any): string => {
  if (args === null || args === undefined) {return "";}
  try {
    const obj = typeof args === "string" ? JSON.parse(args) : args;
    // If it's a simple object with few keys, simpler display? For now just indent
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(args);
  }
};

interface ToolCallsSectionProps {
  toolCalls: any[];
}

const ToolCallsSection: React.FC<ToolCallsSectionProps> = React.memo(({ toolCalls }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();

  const handleToggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Memoize formatted tool args to avoid repeated JSON parsing on every render
  const formattedArgs = useMemo(() => {
    return toolCalls.map(tc => ({
      id: tc.id,
      args: tc.args ? formatToolArgs(tc.args) : ""
    }));
  }, [toolCalls]);

  // Memoize inline styles to avoid recreating on every render
  const detailsStyle = useMemo(() => ({ marginTop: "4px" }), []);
  const summaryStyle = useMemo(() => ({
    fontSize: "0.65rem",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer"
  }), [theme.vars.palette.text.secondary]);

  if (!toolCalls || toolCalls.length === 0) {return null;}

  return (
    <div className="tool-calls-container">
      <div
        className="tool-calls-header"
        onClick={handleToggleExpanded}
      >
        <div className="tool-calls-title">
          <KeyboardArrowDownIcon
            sx={{
              fontSize: 16,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s"
            }}
          />
          Tool Activity
          <span className="tool-calls-count">{toolCalls.length}</span>
        </div>
      </div>
      <Collapse in={expanded}>
        <div className="tool-calls-list">
          {toolCalls.map((tc, index) => (
            <div key={tc.id} className="tool-call-item">
              <div className="tool-call-header-row">
                <div className={`tool-call-status-dot ${tc.status || (tc.message ? "running" : "completed")}`} />
                <div className="tool-call-content">
                  <span className="tool-name">{tc.name}</span>
                  {tc.message && (
                    <div className="tool-message">{tc.message}</div>
                  )}
                   {tc.args && Object.keys(tc.args).length > 0 && (
                     <details style={detailsStyle}>
                       <summary style={summaryStyle}>Arguments</summary>
                       <pre className="tool-args">{formattedArgs[index]?.args}</pre>
                     </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Collapse>
    </div>
  );
});

ToolCallsSection.displayName = "ToolCallsSection";

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

const normalizeExecutionMessage = (msg: Message) => {
  let content = msg.content as any;
  let eventType = msg.execution_event_type;

  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
      if (typeof content === "string") {
        try { 
          content = JSON.parse(content); 
        } catch {
          // Double-encoded JSON parse failed, keep as string
        }
      }
    } catch {
      // JSON parse failed, keep content as string
    }
  }

  if (!eventType && content && typeof content === "object") {
    eventType = content.type;
  }

  return { content, eventType };
};

export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  messages
}) => {
  const theme = useTheme();

  const agentExecutionId = messages?.find(m => m.agent_execution_id)?.agent_execution_id;

  const toolCallsByStep = useGlobalChatStore((state) =>
    agentExecutionId ? state.agentExecutionToolCalls[agentExecutionId] : undefined
  );

  const execution = useMemo<ConsolidatedExecution>(() => {
    const result: ConsolidatedExecution = {
      timeline: [],
      stepResults: new Map(),
      status: "planning"
    };

    if (!messages || messages.length === 0) {
      return result;
    }

    const seenPlanningPhases = new Set<string>();
    const seenTasks = new Map<string, number>();

    messages.forEach((msg, msgIndex) => {
      if (msg.role !== "agent_execution") {return;}

      const { eventType, content } = normalizeExecutionMessage(msg);

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
        if (planningUpdate.status === "Failed") {result.status = "failed";}
      } else if (eventType === "task_update") {
        const taskUpdate = content as TaskUpdate;
        const task = taskUpdate.task;
        const taskIdentifier = task?.id || task?.title || taskUpdate.step?.instructions;
        
        if (taskIdentifier) {
          if (seenTasks.has(taskIdentifier)) {
            const index = seenTasks.get(taskIdentifier)!;
            result.timeline[index].data = taskUpdate;
          } else {
            seenTasks.set(taskIdentifier, result.timeline.length);
            result.timeline.push({
              type: "task",
              data: taskUpdate,
              key: `task-${msgIndex}`
            });
          }
        }

        if (taskUpdate.event === "task_completed") {result.status = "completed";}
        else if (taskUpdate.event === "step_failed") {result.status = "failed";}
        else if (taskUpdate.event === "step_started") {result.status = "executing";}
      } else if (eventType === "step_result") {
        const stepResult = content as StepResult;
        const stepId = stepResult?.step?.id || (stepResult as any)?.step_id || (stepResult as any)?.stepId || stepResult?.step?.instructions;
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

  // Memoize inline styles to prevent re-creation on every render
  const planningItemStyle = useMemo(() => ({ position: "relative" as const, marginBottom: "0.5rem" }), []);
  const logItemStyle = useMemo(() => ({ position: "relative" as const }), []);
  const logDotStyle = useMemo(() => ({
    width: 6,
    height: 6,
    left: "-19px",
    top: "14px",
    backgroundColor: theme.vars.palette.grey[700],
    border: "none",
    boxShadow: "none"
  }), [theme]);
  const taskItemStyle = useMemo(() => ({ position: "relative" as const }), []);
  const stepContainerStyle = useMemo(() => ({ display: "flex" as const, flexDirection: "column" as const, gap: "0.5rem" }), []);
  const additionalStepsGroupStyle = useMemo(() => ({ marginTop: "1rem" }), []);
  const emptyStateStyle = useMemo(() => ({
    padding: "0.75rem 1rem",
    color: theme.vars.palette.text.secondary,
    fontSize: "0.8rem",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: "8px",
    marginBottom: "0.5rem"
  }), [theme]);
  const emptyStateTitleStyle = useMemo(() => ({ fontWeight: 600, marginBottom: "0.25rem" }), []);
  const emptyStateMetaStyle = useMemo(() => ({ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.25rem" }), []);

  const renderTimelineItem = useCallback((item: TimelineItem) => {
    switch (item.type) {
      case "planning":
        return (
          <div key={item.key} style={planningItemStyle}>
            <div className={`timeline-dot ${item.data.status === "Success" ? "completed" : ""}`} />
            <PlanningUpdateDisplay planningUpdate={item.data} />
          </div>
        );
      case "log":
        return (
          <div key={item.key} style={logItemStyle}>
             <div
              className="timeline-dot"
              style={logDotStyle}
            />
            <div className="log-entry">
              {item.data.content}
            </div>
          </div>
        );
      case "task": {
        const taskUpdate = item.data as TaskUpdate;
        const task = taskUpdate.task;
        const currentStep = taskUpdate.step;
        const currentStepId = currentStep?.id || currentStep?.instructions;

        // Find if current step is part of the plan
        const currentStepInPlan =
          !!currentStep &&
          !!task?.steps &&
          task.steps.some((step) =>
            currentStep.id
              ? step.id === currentStep.id
              : step.instructions === currentStep.instructions
          );

        const getStatusBadgeClass = () => {
          if (taskUpdate.event === "task_completed") {return "completed";}
          if (taskUpdate.event === "step_failed") {return "failed";}
          return "";
        };

        const getStatusText = () => {
          if (taskUpdate.event === "task_completed") {return "Completed";}
          if (taskUpdate.event === "step_failed") {return "Failed";}
          return "In Progress";
        };

        return (
          <div key={item.key} style={taskItemStyle}>
             <div className={`consolidated-task-card noscroll ${execution.status === "executing" ? "executing" : ""}`} css={styles(theme)}>

              <div className="task-header-section">
                <div className="task-header-top">
                  <div className="task-label">Agent Task</div>
                  <span className={`task-status-badge ${getStatusBadgeClass()}`}>
                    {getStatusText()}
                  </span>
                </div>
                {task && (
                  <>
                    <Typography className="task-title">{task.title}</Typography>
                    {task.description && (
                      <Typography className="task-description">{task.description}</Typography>
                    )}
                  </>
                )}
              </div>

              <div className="steps-container">
                {task?.steps && task.steps.length > 0 && (
                  <div className="step-group">
                    <span className="section-label">Execution Plan</span>
                    <div className="step-wrapper">
                      {task.steps.map((step, idx) => {
                        const stepKey = step.id || step.instructions;
                        const stepResult = execution.stepResults.get(stepKey);
                         const isCurrent = currentStep && (currentStep.id ? currentStep.id === step.id : currentStep.instructions === step.instructions);
                         const _isRunning = (step.start_time > 0 && !step.completed) || (isCurrent && !step.completed);
                         const stepToolCalls = stepKey ? toolCallsByStep?.[stepKey] || [] : [];

                         return (
                          <div key={idx} style={stepContainerStyle}>
                            <StepView
                              step={{
                                ...step,
                                start_time: step.start_time || (isCurrent && !step.completed ? 1 : 0)
                              }}
                            />
                            <ToolCallsSection toolCalls={stepToolCalls} />
                            {stepResult && <StepResultDisplay stepResult={stepResult} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Handle internal steps that aren't in the original plan */}
                {currentStep && (!task?.steps || !currentStepInPlan) && (
                  <div className="step-group" style={additionalStepsGroupStyle}>
                    <span className="section-label">Additional Steps</span>
                    <div className="step-wrapper">
                      <StepView step={currentStep} />
                      {currentStepId && (
                         <ToolCallsSection toolCalls={toolCallsByStep?.[currentStepId] || []} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  }, [theme, execution, toolCallsByStep, planningItemStyle, logItemStyle, logDotStyle, taskItemStyle, stepContainerStyle, additionalStepsGroupStyle]);

  return (
    <li className="chat-message-list-item execution-event">
      <div className="agent-execution-container" css={styles(theme)}>
        {execution.timeline.length > 0 ? (
          execution.timeline
            .filter((item) => {
              const hasTask = execution.timeline.some((i) => i.type === "task");
              if (hasTask) {
                return item.type === "task";
              }
              return item.type === "planning";
            })
            .map(renderTimelineItem)
        ) : (
          <div style={emptyStateStyle}>
            <div style={emptyStateTitleStyle}>Agent Task</div>
            <div>Processing...</div>
            <div style={emptyStateMetaStyle}>
              {messages.length} message{messages.length !== 1 ? "s" : ""} received
            </div>
          </div>
        )}
      </div>
    </li>
  );
};

export default memo(AgentExecutionView);
