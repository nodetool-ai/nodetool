/**
 * The `steps` field of the Workflow Steps widget: an ordered list of steps,
 * each bound to a node of the widget's operation. An empty list leaves the
 * widget on its automatic steps.
 */
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CustomField } from "@puckeditor/core";
import { createUsePuck } from "@puckeditor/core";

import { useBuilderOperations } from "./BuilderWorkflowContext";
import { EditorButton } from "../../editor_ui";
import {
  Caption,
  DeleteButton,
  FlexColumn,
  FlexRow,
  Label,
  SelectField,
  TextInput,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import type { WorkflowStepConfig } from "./WorkflowStepsWidget";

const usePuck = createUsePuck();

const StepsEditor: React.FC<{
  label: string;
  value: WorkflowStepConfig[];
  readOnly?: boolean;
  onChange: (value: WorkflowStepConfig[]) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { t } = useTranslation();
  const { operations, workflowFor } = useBuilderOperations();
  const selectedOperation = usePuck((state) => {
    const props = state.selectedItem?.props as { operationId?: unknown } | undefined;
    return typeof props?.operationId === "string" ? props.operationId : "";
  });
  const operationId = selectedOperation || operations[0]?.id;
  const nodes = workflowFor(operationId).nodes;
  const options = useMemo(
    () => [
      { label: t("workflowSteps.chooseNode"), value: "" },
      ...nodes.map((node) => ({
        label: node.title ?? `${node.type.split(".").pop() ?? node.type} · ${node.id}`,
        value: node.id
      }))
    ],
    [nodes, t]
  );

  const update = useCallback(
    (index: number, patch: Partial<WorkflowStepConfig>) =>
      onChange(value.map((step, i) => (i === index ? { ...step, ...patch } : step))),
    [onChange, value]
  );

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <Label>{label}</Label>
      {value.length === 0 ? <Caption>{t("workflowSteps.autoHint")}</Caption> : null}
      {value.map((step, index) => (
        <FlexColumn
          key={index}
          gap={SPACING.sm}
          fullWidth
          sx={{
            p: SPACING.md,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: BORDER_RADIUS.md
          }}
        >
          <FlexRow align="center" gap={SPACING.sm} fullWidth>
            <Caption sx={{ flex: 1 }}>{index + 1}</Caption>
            <DeleteButton
              tooltip={t("workflowSteps.removeStep")}
              disabled={readOnly}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            />
          </FlexRow>
          <SelectField
            label={t("workflowSteps.node")}
            value={nodes.some((node) => node.id === step.nodeId) ? (step.nodeId ?? "") : ""}
            options={options}
            disabled={readOnly}
            onChange={(nodeId) => update(index, { nodeId })}
          />
          <TextInput
            size="small"
            label={t("workflowSteps.title")}
            value={step.title ?? ""}
            disabled={readOnly}
            onChange={(event) => update(index, { title: event.target.value })}
          />
          <TextInput
            size="small"
            label={t("workflowSteps.description")}
            value={step.description ?? ""}
            disabled={readOnly}
            onChange={(event) => update(index, { description: event.target.value })}
          />
        </FlexColumn>
      ))}
      <EditorButton
        size="small"
        disabled={readOnly}
        onClick={() => onChange([...value, { nodeId: "", title: "" }])}
      >
        {t("workflowSteps.addStep")}
      </EditorButton>
    </FlexColumn>
  );
};

export const workflowStepsField = (label: string): CustomField<WorkflowStepConfig[]> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <StepsEditor
      label={label}
      value={Array.isArray(value) ? value : []}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});
