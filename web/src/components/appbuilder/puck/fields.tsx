/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useState } from "react";
import type { CustomField } from "@puckeditor/core";

import { SelectField, Caption, FlexColumn } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import {
  makeNodePropertyBinding,
  parseNodePropertyBinding
} from "../nodeBinding";
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

/** Sentinel option that switches the write picker to node-property mode. */
const NODE_PROPERTY_SOURCE = "__node_property__";

const typeTail = (nodeType: string): string =>
  nodeType.split(".").pop() ?? nodeType;

/**
 * Write picker: bind to a workflow input, or drill into any node → property.
 * A node-property binding is stored as `node:<nodeId>#<property>`; while the
 * node/property pair is incomplete the binding is cleared, not half-written.
 */
const WriteBindingPicker: React.FC<{
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const { inputs, nodes } = useBuilderWorkflow();
  const getMetadata = useMetadataStore((s) => s.getMetadata);

  const parsed = parseNodePropertyBinding(value);
  const [nodeSource, setNodeSource] = useState(parsed !== null);
  const [nodeId, setNodeId] = useState(parsed?.nodeId ?? "");

  // Track external value changes (undo, agent edits) without fighting the
  // intentionally-empty value while the node/property pair is being picked.
  useEffect(() => {
    const p = parseNodePropertyBinding(value);
    if (p) {
      setNodeSource(true);
      setNodeId(p.nodeId);
    } else if (value) {
      setNodeSource(false);
      setNodeId("");
    }
  }, [value]);

  // Nodes that expose at least one property, labeled by custom title or
  // metadata title, disambiguated with a short id when titles collide.
  const nodeOptions: Option[] = useMemo(() => {
    const candidates = nodes
      .map((node) => {
        const meta = getMetadata(node.type);
        if (!meta || meta.properties.length === 0) return null;
        return {
          value: node.id,
          title: node.title || meta.title || typeTail(node.type)
        };
      })
      .filter((o): o is { value: string; title: string } => o !== null);
    const titleCounts = new Map<string, number>();
    for (const c of candidates) {
      titleCounts.set(c.title, (titleCounts.get(c.title) ?? 0) + 1);
    }
    return candidates.map((c) => ({
      value: c.value,
      label:
        (titleCounts.get(c.title) ?? 0) > 1
          ? `${c.title} · ${c.value.slice(0, 6)}`
          : c.title
    }));
  }, [nodes, getMetadata]);

  const selectedNode = nodes.find((n) => n.id === nodeId);
  const nodeMeta = selectedNode ? getMetadata(selectedNode.type) : undefined;
  const propertyOptions: Option[] = (nodeMeta?.properties ?? []).map((p) => ({
    label: p.title || p.name,
    value: p.name
  }));
  const selectedProperty =
    parsed && parsed.nodeId === nodeId ? parsed.property : "";
  const propertyMeta = nodeMeta?.properties.find(
    (p) => p.name === selectedProperty
  );

  const sourceOptions: Option[] = [
    ...inputs.map((i) => ({ label: `input · ${i.label}`, value: i.name })),
    ...(nodeOptions.length > 0
      ? [{ label: "Node property…", value: NODE_PROPERTY_SOURCE }]
      : [])
  ];

  const handleSourceChange = (next: string) => {
    if (next === NODE_PROPERTY_SOURCE) {
      setNodeSource(true);
      if (value) onChange("");
      return;
    }
    setNodeSource(false);
    setNodeId("");
    onChange(next);
  };

  return (
    <FlexColumn gap={0.5}>
      <SelectField
        label={label}
        value={nodeSource ? NODE_PROPERTY_SOURCE : value}
        options={[NONE, ...sourceOptions]}
        disabled={readOnly || sourceOptions.length === 0}
        onChange={handleSourceChange}
      />
      {sourceOptions.length === 0 && (
        <Caption color="secondary">
          Add an Input node — or any node with properties — to bind this
          control.
        </Caption>
      )}
      {nodeSource && (
        <>
          <SelectField
            label="Node"
            value={nodeId}
            options={[NONE, ...nodeOptions]}
            disabled={readOnly}
            onChange={(next) => {
              setNodeId(next);
              if (value) onChange("");
            }}
          />
          <SelectField
            label="Property"
            value={selectedProperty}
            options={[NONE, ...propertyOptions]}
            disabled={readOnly || !nodeId}
            onChange={(next) =>
              onChange(next ? makeNodePropertyBinding(nodeId, next) : "")
            }
          />
          {propertyMeta && (
            <Caption color="secondary">
              {propertyMeta.type.type}
              {propertyMeta.default !== undefined &&
              propertyMeta.default !== null
                ? ` · default ${String(propertyMeta.default)}`
                : ""}
            </Caption>
          )}
        </>
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
