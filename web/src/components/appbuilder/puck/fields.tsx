/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import type { CustomField } from "@puckeditor/core";
import { useGetPuck } from "@puckeditor/core";

import {
  SelectField,
  Caption,
  FlexColumn,
  Autocomplete,
  TextInput
} from "../../ui_primitives";
import type { AutocompleteOption } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import type { Property } from "../../../stores/ApiTypes";
import {
  encodeBinding,
  parseBinding,
  resolveBinding,
  type BindingMode,
  type BindingScope,
  type ConditionProps
} from "@nodetool-ai/app-runtime";
import {
  computeAutofillProps,
  NUMERIC_WIDGET_DEFAULTS,
  type AutofillableProps,
  type NumericBindingTarget
} from "../bindingAutofill";
import { getSlotFields, updateComponentProps } from "./puckDataOps";
import {
  useBuilderBindingScope,
  useBuilderOperations,
  useBuilderWorkflow
} from "./BuilderWorkflowContext";
import type { WorkflowInputIO } from "../workflowIO";

type Option = { label: string; value: string };
const NONE: Option = { label: "— none —", value: "" };

/**
 * The operation a picker binds against, and that operation's graph surface.
 *
 * A stored binding carries its own operation, so editing an existing binding
 * stays on the operation it was authored for; a fresh one goes to the operation
 * the author selected. An operation the document no longer declares (a legacy
 * `main` token among them) falls back to the selection, which resolves such a
 * binding onto the app's sole operation.
 */
const useBindingOperation = (
  binding: string
) => {
  const { operations, selectedOperationId, selectOperation, workflowFor } =
    useBuilderOperations();
  const stored = parseBinding(binding);
  const named =
    stored && "operationId" in stored ? stored.operationId : undefined;
  const operationId =
    named && operations.some((op) => op.id === named)
      ? named
      : selectedOperationId;
  return {
    operationId,
    operations: operations.map(({ id, name }) => ({ id, name })),
    workflow: workflowFor(operationId),
    select: selectOperation
  };
};

/**
 * Operation chooser, shown only when the app binds more than one — a
 * single-operation app has nothing to choose. Switching clears the binding:
 * another operation runs another graph, so the picked node does not carry over.
 */
const OperationSelect: React.FC<{
  operations: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  readOnly?: boolean;
  onChange: (operationId: string) => void;
}> = ({ operations, value, readOnly, onChange }) => {
  if (operations.length < 2) return null;
  return (
    <SelectField
      label="Operation"
      value={value}
      options={operations.map((op) => ({
        label: op.name || op.id,
        value: op.id
      }))}
      disabled={readOnly}
      onChange={onChange}
    />
  );
};

/**
 * Normalize a stored binding to its ID form. Documents written before ID-based
 * bindings store names; the picker resolves them once so the stored value
 * matches an option, and writes back the ID form on the next edit.
 */
const canonicalBinding = (
  value: string,
  scope: BindingScope,
  mode: BindingMode
): string => {
  if (!value) return "";
  const ref = resolveBinding(value, scope, mode);
  return ref ? encodeBinding(ref) : value;
};

const Picker: React.FC<{
  label: string;
  value: string;
  options: Option[];
  emptyHint?: string;
  /** Show the hint even though the picker has options (execution fields). */
  hintVisible?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, options, emptyHint, hintVisible, readOnly, onChange }) => {
  const hasOptions = options.length > 0;
  const showHint = hintVisible ?? !hasOptions;
  // Rebuilt inline, this array would defeat SelectField's memo.
  const withNone = useMemo(() => [NONE, ...options], [options]);
  return (
    <FlexColumn gap={0.5}>
      <SelectField
        label={label}
        value={value}
        options={withNone}
        disabled={readOnly || !hasOptions}
        onChange={onChange}
      />
      {showHint && emptyHint && <Caption color="secondary">{emptyHint}</Caption>}
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
  const { operationId, operations, workflow, select } =
    useBindingOperation(value);
  const { outputs, variables } = workflow;
  const scope = useBuilderBindingScope();
  const options: Option[] = [
    ...outputs.map((o) => ({
      label: `output · ${o.label}`,
      value: encodeBinding({
        kind: "output",
        operationId,
        nodeId: o.nodeId
      })
    })),
    ...variables.map((v) => ({
      label: `variable · ${v}`,
      value: encodeBinding({ kind: "variable", variableId: v })
    })),
    ...executionOptions(operationId)
  ];
  return (
    <FlexColumn gap={0.5}>
      <OperationSelect
        operations={operations}
        value={operationId}
        readOnly={readOnly}
        onChange={(next) => {
          select(next);
          onChange("");
        }}
      />
      <Picker
        label={label}
        value={canonicalBinding(value, scope, "read")}
        options={options}
        // Execution fields are always bindable, so "nothing to bind" is about
        // the workflow's own outputs and variables.
        hintVisible={outputs.length === 0 && variables.length === 0}
        emptyHint="Add an Output node or Set Variable node to the workflow."
        readOnly={readOnly}
        onChange={onChange}
      />
    </FlexColumn>
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
    min: prop.min ?? undefined,
    max: prop.max ?? undefined,
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
  const { operationId, operations, workflow, select } =
    useBindingOperation(value);
  const { inputs, nodes } = workflow;
  const scope = useBuilderBindingScope();
  const getMetadata = useMetadataStore((s) => s.getMetadata);
  const getPuck = useGetPuck();

  const options = useMemo<BindingOption[]>(() => {
    const inputOptions: BindingOption[] = inputs.map((input) => ({
      label: `input · ${input.label}`,
      value: encodeBinding({
        kind: "input",
        operationId,
        nodeId: input.nodeId
      }),
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
          value: encodeBinding({
            kind: "nodeProperty",
            operationId,
            nodeId: node.id,
            property: prop.name
          }),
          group,
          rowLabel,
          target: numericTargetFromProperty(prop)
        });
      }
    }

    return [...inputOptions, ...nodeOptions];
  }, [inputs, nodes, getMetadata, operationId]);

  const { selectedOption, resolvedOptions } = useMemo(() => {
    const canonical = canonicalBinding(value, scope, "write");
    const found = options.find((o) => o.value === canonical) ?? null;
    if (!value || found) {
      return { selectedOption: found, resolvedOptions: options };
    }
    // Stale binding (target node/input removed): keep it legible and selectable.
    const parsed = parseBinding(canonical);
    const label =
      parsed?.kind === "nodeProperty"
        ? `${parsed.nodeId.slice(0, 6)} · ${parsed.property}`
        : `input · ${value}`;
    const orphan: BindingOption = {
      label,
      value: canonical,
      group: "Unavailable",
      rowLabel: label
    };
    return {
      selectedOption: orphan,
      resolvedOptions: [orphan, ...options]
    };
  }, [options, scope, value]);

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
      <OperationSelect
        operations={operations}
        value={operationId}
        readOnly={readOnly}
        onChange={(next) => {
          select(next);
          onChange("");
        }}
      />
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

/**
 * Which operation a run/cancel event drives. The document's own operations are
 * the options — an app is not assumed to have one called `main`. Renders
 * nothing while the app binds a single operation: there is nothing to choose,
 * and an event that names none runs that one.
 */
export const operationField = (label = "Operation"): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <EventOperationPicker
      label={label}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});

const EventOperationPicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { operations } = useBuilderOperations();
  if (operations.length < 2) return null;
  return (
    <SelectField
      label={label}
      value={operations.some((op) => op.id === value) ? value : ""}
      options={[
        { label: "— default —", value: "" },
        ...operations.map((op) => ({ label: op.name || op.id, value: op.id }))
      ]}
      disabled={readOnly}
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
  const scope = useBuilderBindingScope();
  return (
    <Picker
      label={label}
      value={canonicalBinding(value, scope, "read")}
      options={variables.map((v) => ({
        label: v,
        value: encodeBinding({ kind: "variable", variableId: v })
      }))}
      emptyHint="Add a Set Variable node to the workflow to create app state."
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};

const CONDITION_OPS: Option[] = [
  { label: "is not empty", value: "notEmpty" },
  { label: "is empty", value: "empty" },
  { label: "equals", value: "eq" },
  { label: "does not equal", value: "neq" },
  { label: "is greater than", value: "gt" },
  { label: "is at least", value: "gte" },
  { label: "is less than", value: "lt" },
  { label: "is at most", value: "lte" },
  { label: "contains", value: "contains" }
];

/** Operators that compare against a literal, so the value box is meaningful. */
const OPS_WITH_VALUE = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains"
]);

/**
 * What a run reports about itself. Bindable from any read widget (a Text
 * showing the agent's current step) and from a condition.
 */
const EXECUTION_FIELDS = [
  ["running", "is running"],
  ["progress", "progress"],
  ["error", "error"],
  ["activity", "activity"]
] as const;

const executionOptions = (operationId: string): Option[] =>
  EXECUTION_FIELDS.map(([field, label]) => ({
    label: `run · ${label}`,
    value: encodeBinding({ kind: "execution", operationId, field })
  }));

/**
 * Condition field: a state reference, an operator, and (for comparisons) a
 * literal. This plus the `format` template is the whole logic vocabulary the
 * app layer offers — anything more expressive belongs in the graph.
 */
export const conditionField = (
  label: string
): CustomField<ConditionProps> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <ConditionEditor
      label={label}
      value={value ?? {}}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});

const ConditionEditor: React.FC<{
  label: string;
  value: ConditionProps;
  readOnly?: boolean;
  onChange: (value: ConditionProps) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { operationId, operations, workflow, select } = useBindingOperation(
    value.binding ?? ""
  );
  const { inputs, outputs, variables } = workflow;
  const scope = useBuilderBindingScope();
  const options: Option[] = [
    ...outputs.map((o) => ({
      label: `output · ${o.label}`,
      value: encodeBinding({
        kind: "output",
        operationId,
        nodeId: o.nodeId
      })
    })),
    ...inputs.map((i) => ({
      label: `input · ${i.label}`,
      value: encodeBinding({
        kind: "input",
        operationId,
        nodeId: i.nodeId
      })
    })),
    ...variables.map((v) => ({
      label: `variable · ${v}`,
      value: encodeBinding({ kind: "variable", variableId: v })
    })),
    ...executionOptions(operationId)
  ];
  const op = value.op ?? "notEmpty";
  return (
    <FlexColumn gap={0.5}>
      <OperationSelect
        operations={operations}
        value={operationId}
        readOnly={readOnly}
        onChange={(next) => {
          select(next);
          onChange({ ...value, binding: "" });
        }}
      />
      <Picker
        label={label}
        value={canonicalBinding(value.binding ?? "", scope, "none")}
        options={options}
        hintVisible={
          outputs.length === 0 && inputs.length === 0 && variables.length === 0
        }
        emptyHint="Add an Input, Output, or Set Variable node to condition on."
        readOnly={readOnly}
        onChange={(binding) => onChange({ ...value, binding })}
      />
      {value.binding ? (
        <>
          <SelectField
            label="Condition"
            value={op}
            options={CONDITION_OPS}
            disabled={readOnly}
            onChange={(next) => onChange({ ...value, op: next })}
          />
          {OPS_WITH_VALUE.has(op) ? (
            <TextInput
              label="Value"
              value={value.value ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                onChange({ ...value, value: event.target.value })
              }
            />
          ) : null}
        </>
      ) : null}
    </FlexColumn>
  );
};

/**
 * Resource binding field: pick one of the resource collections the app
 * document declares. The bindings themselves are authored on the application
 * record, not per widget — a widget only names which one it drives.
 */
export const resourceBindingField = (
  label = "Resource"
): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange, readOnly }) => (
    <ResourceBindingPicker
      label={label}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={onChange}
    />
  )
});

const ResourceBindingPicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { resources } = useBuilderWorkflow();
  return (
    <Picker
      label={label}
      value={value}
      options={resources.map((r) => ({
        label: `${r.kind} · ${r.name}`,
        value: r.id
      }))}
      emptyHint="Add a resource binding to the app to connect a collection."
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};
