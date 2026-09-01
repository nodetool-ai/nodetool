/**
 * One widget that renders the whole input form of one operation: a control per
 * workflow Input node, each reading and writing its own state slot.
 *
 * WorkflowInput binds one node; this binds none. It resolves the operation's
 * bindable surface with `ioFor` and builds each row's `{kind: "input"}` ref
 * itself, so adding an Input node to the graph adds a row with no edit to the
 * app document.
 *
 * Hooks cannot run in a loop, so every row is its own component — that is the
 * only reason `WorkflowFormRow` exists.
 */
import React, { useMemo } from "react";

import { Caption, FlexColumn, Label, SPACING } from "../../ui_primitives";
import { AppEvent } from "../types";
import {
  useAppRuntimeContext,
  useBindingValue
} from "../runtime/AppRuntimeContext";
import { WorkflowInputIO } from "../workflowIO";
import { WorkflowInputControl } from "./WorkflowInputWidget";
import { useWidgetRuntime } from "./useWidgetRuntime";

export interface WorkflowFormWidgetProps {
  id: string;
  /** The operation whose inputs the form renders; unset means the default one. */
  operationId?: string;
  /** Heading above the form. */
  label?: string;
  /** "no" hides each input's description caption. Defaults to "yes". */
  showDescriptions?: "yes" | "no";
  events?: AppEvent[];
}

const WorkflowFormRow: React.FC<{
  input: WorkflowInputIO;
  operationId: string;
  showDescription: boolean;
  onChanged: () => void;
}> = ({ input, operationId, showDescription, onChanged }) => {
  const { write } = useAppRuntimeContext();
  const ref = { kind: "input", operationId, nodeId: input.nodeId } as const;
  const value = useBindingValue(ref);

  // The control shows a description for some kinds and hides it in a tooltip
  // for others; strip it there so the form captions every row the same way.
  const controlInput = useMemo(
    () => ({ ...input, description: undefined }),
    [input]
  );

  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      <WorkflowInputControl
        input={controlInput}
        value={value}
        onValue={(next) => {
          write(ref, next);
          onChanged();
        }}
      />
      {showDescription && input.description ? (
        <Caption color="secondary">{input.description}</Caption>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowFormWidget: React.FC<WorkflowFormWidgetProps> = ({
  id,
  operationId,
  label,
  showDescriptions,
  events
}) => {
  const { ioFor, scope, designMode } = useAppRuntimeContext();
  // The form owns no single binding, so it takes "none": a "write" mode would
  // claim a view slot of its own, which would hold a value nothing reads. All
  // it needs from the runtime is `emit`, and with it the shared event pacing.
  const { emit } = useWidgetRuntime({ id, bindingMode: "none", events });

  const io = ioFor(operationId);
  const targetOperationId = operationId ?? scope.defaultOperationId;
  const heading = label ? <Label>{label}</Label> : null;

  // Nothing is fetched in the builder's design surface, so the form describes
  // itself instead of rendering controls over an empty runtime.
  if (designMode) {
    return (
      <FlexColumn gap={SPACING.xs} fullWidth>
        {heading}
        {io.inputs.length === 0 ? (
          <Caption color="secondary">
            This form shows every input of its operation when the app runs.
          </Caption>
        ) : (
          io.inputs.map((input) => (
            <Caption key={input.nodeId} color="secondary">
              {input.label || input.name} — {input.kind}
            </Caption>
          ))
        )}
      </FlexColumn>
    );
  }

  if (io.inputs.length === 0) {
    return (
      <FlexColumn gap={SPACING.xs} fullWidth>
        {heading}
        <Caption color="secondary">This operation has no inputs.</Caption>
      </FlexColumn>
    );
  }

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      {heading}
      {io.inputs.map((input) => (
        <WorkflowFormRow
          key={input.nodeId}
          input={input}
          operationId={targetOperationId}
          showDescription={showDescriptions !== "no"}
          onChanged={() => emit("change")}
        />
      ))}
    </FlexColumn>
  );
};

export default WorkflowFormWidget;
