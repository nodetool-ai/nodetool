/** @jsxImportSource @emotion/react */
import React from "react";
import type { CustomField } from "@puckeditor/core";

import { SelectField, Caption, FlexColumn } from "../../ui_primitives";
import { useBuilderWorkflow } from "./BuilderWorkflowContext";

type Option = { label: string; value: string };
const NONE: Option = { label: "— none —", value: "" };

const Picker: React.FC<{
  label: string;
  value: string;
  options: Option[];
  emptyHint?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, options, emptyHint, readOnly, onChange }) => {
  const hasOptions = options.length > 0;
  return (
    <FlexColumn gap={0.5}>
      <SelectField
        label={label}
        value={value}
        options={[NONE, ...options]}
        disabled={readOnly || !hasOptions}
        onChange={onChange}
      />
      {!hasOptions && emptyHint && (
        <Caption color="secondary">{emptyHint}</Caption>
      )}
    </FlexColumn>
  );
};

/**
 * Binding field: inputs bind to input nodes (write), displays bind to output
 * nodes or Variables (read). Only existing workflow nodes/variables are
 * offered — add the node to the workflow first.
 */
export const bindingField = (
  mode: "write" | "read",
  label = "Bind to"
): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <BindingPicker
      mode={mode}
      label={label}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});

const BindingPicker: React.FC<{
  mode: "write" | "read";
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ mode, label, value, readOnly, onChange }) => {
  const { inputs, outputs, variables } = useBuilderWorkflow();
  const options: Option[] =
    mode === "write"
      ? inputs.map((i) => ({ label: `input · ${i.label}`, value: i.name }))
      : [
          ...outputs.map((o) => ({ label: `output · ${o.label}`, value: o.name })),
          ...variables.map((v) => ({ label: `variable · ${v}`, value: v }))
        ];
  const emptyHint =
    mode === "write"
      ? "Add an Input node to the workflow to bind this control."
      : "Add an Output node or Set Variable node to the workflow.";
  return (
    <Picker
      label={label}
      value={value}
      options={options}
      emptyHint={emptyHint}
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};

/** Variable field: pick a Variable name for app state (setState / toggleState). */
export const variableField = (label = "Variable"): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <VariablePicker
      label={label}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});

const VariablePicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { variables } = useBuilderWorkflow();
  return (
    <Picker
      label={label}
      value={value}
      options={variables.map((v) => ({ label: v, value: v }))}
      emptyHint="Add a Set Variable node to the workflow to create app state."
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};
