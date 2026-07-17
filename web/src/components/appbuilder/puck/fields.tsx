/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import type { CustomField } from "@puckeditor/core";
import { useGetPuck } from "@puckeditor/core";

import {
  SelectField,
  Caption,
  FlexColumn,
  Autocomplete
} from "../../ui_primitives";
import type { AutocompleteOption } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import type { Property } from "../../../stores/ApiTypes";
import {
  makeNodePropertyBinding,
  parseNodePropertyBinding
} from "../nodeBinding";
import {
  computeAutofillProps,
  NUMERIC_WIDGET_DEFAULTS,
  type AutofillableProps,
  type NumericBindingTarget
} from "../bindingAutofill";
import { getSlotFields, updateComponentProps } from "./puckDataOps";
import { useBuilderWorkflow } from "./BuilderWorkflowContext";
import type { WorkflowInputIO } from "../workflowIO";

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
 * Binding field: inputs bind to input nodes or any node property (write),
 * displays bind to output nodes or Variables (read). Only existing workflow
 * nodes/variables are offered — add the node to the workflow first.
 */
export const bindingField = (
  mode: "write" | "read",
  label = "Bind to"
): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) =>
    mode === "write" ? (
      <WriteBindingPicker
        label={label}
        value={value ?? ""}
        readOnly={readOnly}
        onChange={onChange}
      />
    ) : (
      <ReadBindingPicker
        label={label}
        value={value ?? ""}
        readOnly={readOnly}
        onChange={onChange}
      />
    )
});

const ReadBindingPicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { outputs, variables } = useBuilderWorkflow();
  const options: Option[] = [
    ...outputs.map((o) => ({ label: `output · ${o.label}`, value: o.name })),
    ...variables.map((v) => ({ label: `variable · ${v}`, value: v }))
  ];
  return (
    <Picker
      label={label}
      value={value}
      options={options}
      emptyHint="Add an Output node or Set Variable node to the workflow."
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};

const typeTail = (nodeType: string): string =>
  nodeType.split(".").pop() ?? nodeType;

/** The numeric constraints a Slider/NumberInput can inherit from a property. */
const numericTargetFromProperty = (
  prop: Property
): NumericBindingTarget | undefined => {
  const t = prop.type?.type;
  const isInt = t === "int";
  const isFloat = t === "float";
  if (!isInt && !isFloat) return undefined;
  return {
    min: typeof prop.min === "number" ? prop.min : undefined,
    max: typeof prop.max === "number" ? prop.max : undefined,
    isInt,
    label: prop.title || prop.name
  };
};

/** The same, for a workflow input node. */
const numericTargetFromInput = (
  input: WorkflowInputIO
): NumericBindingTarget | undefined => {
  const isInt = input.kind === "integer";
  const isFloat = input.kind === "float";
  if (!isInt && !isFloat) return undefined;
  return { min: input.min, max: input.max, isInt, label: input.label };
};

/** One searchable entry: workflow input or node property. */
interface BindingOption extends AutocompleteOption {
  /** Group header (search still matches this via the full label). */
  group: string;
  /** Property/input name shown in the dropdown row (group carries the node). */
  rowLabel: string;
  /** Numeric constraints to autofill into the widget, when applicable. */
  target?: NumericBindingTarget;
}

const INPUTS_GROUP = "Inputs";

/**
 * Write picker: a searchable field over workflow inputs and every node
 * property, grouped by node. Inputs bind by name; node properties bind as
 * `node:<nodeId>#<property>`. Binding a numeric target into a Slider/NumberInput
 * also autofills its min/max/step/label (see {@link computeAutofillProps}).
 */
const WriteBindingPicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { inputs, nodes } = useBuilderWorkflow();
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const getPuck = useGetPuck();

  const options = useMemo<BindingOption[]>(() => {
    const inputOptions: BindingOption[] = inputs.map((input) => ({
      label: `input · ${input.label}`,
      value: input.name,
      group: INPUTS_GROUP,
      rowLabel: input.label,
      target: numericTargetFromInput(input)
    }));

    // Node title with the same collision-disambiguation as before: a short id
    // suffix only when two nodes share a title.
    const titled = nodes
      .map((node) => {
        const meta = getMetadata(node.type);
        if (!meta || meta.properties.length === 0) return null;
        return {
          node,
          meta,
          title: node.title || meta.title || typeTail(node.type)
        };
      })
      .filter(
        (n): n is NonNullable<typeof n> => n !== null
      );
    const titleCounts = new Map<string, number>();
    for (const n of titled) {
      titleCounts.set(n.title, (titleCounts.get(n.title) ?? 0) + 1);
    }

    const nodeOptions: BindingOption[] = [];
    for (const { node, meta, title } of titled) {
      const group =
        (titleCounts.get(title) ?? 0) > 1
          ? `${title} · ${node.id.slice(0, 6)}`
          : title;
      for (const prop of meta.properties) {
        const rowLabel = prop.title || prop.name;
        nodeOptions.push({
          label: `${group} · ${rowLabel}`,
          value: makeNodePropertyBinding(node.id, prop.name),
          group,
          rowLabel,
          target: numericTargetFromProperty(prop)
        });
      }
    }

    return [...inputOptions, ...nodeOptions];
  }, [inputs, nodes, getMetadata]);

  const { selectedOption, resolvedOptions } = useMemo(() => {
    const found = options.find((o) => o.value === value) ?? null;
    if (!value || found) {
      return { selectedOption: found, resolvedOptions: options };
    }
    // Stale binding (target node/input removed): keep it legible and selectable.
    const parsed = parseNodePropertyBinding(value);
    const label = parsed
      ? `${parsed.nodeId.slice(0, 6)} · ${parsed.property}`
      : `input · ${value}`;
    const orphan: BindingOption = {
      label,
      value,
      group: "Unavailable",
      rowLabel: label
    };
    return {
      selectedOption: orphan,
      resolvedOptions: [orphan, ...options]
    };
  }, [options, value]);

  const applyBinding = (option: BindingOption | null) => {
    const nextBinding = option?.value ?? "";
    const store = getPuck();
    const selected = store.selectedItem;
    const defaults = selected?.type
      ? NUMERIC_WIDGET_DEFAULTS[selected.type]
      : undefined;
    const autofill =
      option?.target && defaults && selected
        ? computeAutofillProps(
            option.target,
            selected.props as AutofillableProps,
            defaults
          )
        : {};

    if (!selected || Object.keys(autofill).length === 0) {
      onChange(nextBinding);
      return;
    }
    // Set the binding and the inherited numeric props in one atomic edit.
    const slotFields = getSlotFields(store.config);
    const { data } = updateComponentProps(
      store.appState.data,
      slotFields,
      selected.props.id as string,
      { ...autofill, binding: nextBinding }
    );
    store.dispatch({ type: "setData", data });
  };

  const hasOptions = options.length > 0;

  return (
    <FlexColumn gap={0.5}>
      <Autocomplete<BindingOption>
        label={label}
        placeholder="Search inputs and node properties…"
        options={resolvedOptions}
        value={selectedOption}
        disabled={readOnly || !hasOptions}
        groupBy={(o) => o.group}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.value === b.value}
        renderOption={(props, option) => {
          const { key, ...liProps } = props;
          return (
            <li key={key} {...liProps}>
              {option.rowLabel}
            </li>
          );
        }}
        onChange={(_event, option) => applyBinding(option)}
      />
      {!hasOptions && (
        <Caption color="secondary">
          Add an Input node — or any node with properties — to bind this control.
        </Caption>
      )}
    </FlexColumn>
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
