/** Configured workflow steps follow the selected operation's node runs. */
import type { ReactNode } from "react";
import { isOperationRunning, operationNodeRuns, operationProgress } from "@nodetool-ai/app-runtime";
import { useAppRuntimeContext, useRuntimeSelector } from "../runtime/context";
import { FieldLabel, isRecord, str, type WidgetProps } from "./shared";

export function WorkflowStepsWidget(widget: WidgetProps): ReactNode {
  const { scope } = useAppRuntimeContext();
  const target = str(widget.props.operationId) || scope.defaultOperationId;
  const runs = useRuntimeSelector((state) => operationNodeRuns(state, target));
  const running = useRuntimeSelector((state) => isOperationRunning(state, target));
  const progress = useRuntimeSelector((state) => operationProgress(state, target));
  const steps = Array.isArray(widget.props.steps)
    ? widget.props.steps.filter(isRecord).filter((step) => typeof step.nodeId === "string" && step.nodeId.trim())
    : [];
  if (steps.length === 0 && !running) return null;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      {steps.length === 0 ? (
        <progress aria-label="Workflow progress" max={1} value={progress} />
      ) : (
        <ol className="nt-stack" aria-label={str(widget.props.label) || "Workflow steps"}>
          {steps.map((step, index) => {
            const nodeId = str(step.nodeId);
            const run = runs[nodeId];
            const state = !run ? "pending"
              : run.error || run.status === "error" || run.status === "failed" ? "failed"
              : run.status === "completed" ? "done" : "running";
            const status = state === "pending" ? "Waiting" : state === "done" ? "Done"
              : state === "failed" ? "Failed" : "Running";
            return (
              <li key={`${nodeId}-${index}`} data-state={state} aria-current={state === "running" ? "step" : undefined}>
                <div className="nt-row">
                  <span>{str(step.title).trim() || nodeId}</span>
                  <span className="nt-hint">{status}</span>
                </div>
                {step.description ? <div className="nt-hint">{str(step.description)}</div> : null}
                {state === "running" ? <progress aria-label={`${str(step.title).trim() || nodeId} progress`} max={1} value={run?.progress} /> : null}
                {run?.error ? <div className="nt-hint" role="alert">{run.error}</div> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
