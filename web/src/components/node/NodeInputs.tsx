/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import PropertyField from "./PropertyField";
import { Property, NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import isEqual from "../../utils/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import { useConnectedEdgesSelector } from "../../hooks/nodes/useConnectedEdges";
import useMetadataStore from "../../stores/MetadataStore";
import { findOutputHandle } from "../../utils/handleUtils";
import { normalizeDynamicSlot } from "../../utils/dynamicSlots";
import { inferredCodeInputNamesFromData } from "../../utils/codeNodeHandles";
import { isFieldRelevantDataEqual } from "./propertyFieldEquality";
import {
  isPropertyConditionSatisfied,
  shouldRenderProperty
} from "../../utils/propertyVisibility";

const rootCss = css({
  marginTop: "1em",
  marginBottom: "0.5em"
});

interface NodeInputsProps {
  id: string;
  layout?: string;
  nodeType: string;
  properties: Property[];
  data: NodeData;
  nodeMetadata: NodeMetadata;
  showFields?: boolean;
  showHandle?: boolean;
  onUpdatePropertyName?: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
  onDeleteProperty?: (propertyName: string) => void;
  editableDynamicInputs?: boolean;
  /**
   * Render the node's dynamic-property inputs. Defaults to `true`. Set
   * `false` when a body renders dynamic inputs in a separate block (e.g.
   * `ContentCardBody`) and only wants the static `properties` here.
   */
  showDynamicInputs?: boolean;
  /**
   * Fallback type for an unconnected dynamic input that has no declared
   * `dynamic_inputs` entry. Without it such inputs resolve to `any` (no
   * editor). Combine-style nodes (Concat, mixers) pass their primary-output
   * type so a Concatenate-text input becomes an editable `str`, etc. A
   * connected edge's source type still wins over this.
   */
  defaultDynamicInputType?: TypeMetadata;
}

interface NodeInputProps {
  id: string;
  nodeType: string;
  layout?: string;
  property: Property;
  propertyIndex: string;
  data: NodeData;
  showFields: boolean;
  showHandle: boolean;
  tabIndex: number;
  isDynamicProperty?: boolean;
  onDeleteProperty?: (propertyName: string) => void;
  onUpdatePropertyName?: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
  isConnected: boolean;
}

// Resolve the current value for an input. Use dynamic_properties for dynamic
// inputs; otherwise use properties. Fallback to the property's default when
// undefined to avoid runtime errors. Shared by render and the memo comparator
// so the two never drift.
const resolveInputValue = (props: NodeInputProps): unknown =>
  props.isDynamicProperty
    ? props.data?.dynamic_properties?.[props.property.name] ??
      props.property.default
    : props.data?.properties?.[props.property.name] ?? props.property.default;

const NodeInput: React.FC<NodeInputProps> = memo(
  function NodeInput(props) {
    const {
      id,
      nodeType,
      layout,
      property,
      propertyIndex,
      data,
      showFields,
      showHandle,
      tabIndex,
      isDynamicProperty,
      isConnected
    } = props;

    return (
      <PropertyField
        key={`${isDynamicProperty ? "dynamic-" : ""}${property.name}-${id}`}
        id={id}
        value={resolveInputValue(props)}
        nodeType={nodeType}
        layout={layout}
        property={property}
        propertyIndex={propertyIndex}
        showFields={showFields}
        showHandle={showHandle}
        tabIndex={tabIndex}
        isDynamicProperty={isDynamicProperty}
        data={data}
        isConnected={isConnected}
        conditionalUnavailable={
          isConnected &&
          !isPropertyConditionSatisfied(property, data?.properties)
        }
      />
    );
  },
  // Compare only what this field renders from, not the whole node `data`
  // (which made every field re-render — and deep-walk the full blob — when a
  // single sibling property changed).
  (prev, next) => {
    if (
      prev.id !== next.id ||
      prev.nodeType !== next.nodeType ||
      prev.layout !== next.layout ||
      prev.propertyIndex !== next.propertyIndex ||
      prev.showFields !== next.showFields ||
      prev.showHandle !== next.showHandle ||
      prev.tabIndex !== next.tabIndex ||
      prev.isDynamicProperty !== next.isDynamicProperty ||
      prev.isConnected !== next.isConnected ||
      prev.onDeleteProperty !== next.onDeleteProperty ||
      prev.onUpdatePropertyName !== next.onUpdatePropertyName
    ) {
      return false;
    }
    if (!isFieldRelevantDataEqual(prev.data, next.data, prev.isDynamicProperty)) {
      return false;
    }
    if (!isEqual(prev.property, next.property)) {
      return false;
    }
    return isEqual(resolveInputValue(prev), resolveInputValue(next));
  }
);

const NodeInputsImpl: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeType,
  showHandle = true,
  showFields = true,
  layout,
  editableDynamicInputs = true,
  showDynamicInputs = true,
  defaultDynamicInputType
}) => {
  const tabableProperties = useMemo(
    () =>
      properties.filter((property) => {
        const type = property.type;
        return !type.optional && type.type !== "readonly";
      }),
    [properties]
  );

  const dynamicProperties: { [key: string]: Property } = useMemo(
    () => (data?.dynamic_properties || {}) as { [key: string]: Property },
    [data?.dynamic_properties]
  );

  const findNode = useNodes((state) => state.findNode);

  // Use optimized stable selector for connected edges to prevent re-renders on unrelated edge changes
  const connectedEdgesSelector = useConnectedEdgesSelector(id);
  const connectedEdges = useNodes(connectedEdgesSelector);

  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const connectedHandleSet = useMemo(
    () => new Set(connectedEdges.map((edge) => edge.targetHandle)),
    [connectedEdges]
  );

  const connectedEdgeByHandle = useMemo(() => {
    const map = new Map<string, (typeof connectedEdges)[number]>();
    for (const edge of connectedEdges) {
      if (edge.targetHandle) map.set(edge.targetHandle, edge);
    }
    return map;
  }, [connectedEdges]);

  const tabIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    tabableProperties.forEach((p, i) => map.set(p.name, i + 1));
    return map;
  }, [tabableProperties]);

  // A property can switch another one off via `visible_when` — the folder
  // picker on a save node writing to the workspace, or a cloning input a model
  // does not support. Rendering it would offer a control that changes
  // nothing. A connected input always renders.
  const shownProperties = useMemo(
    () =>
      properties.filter((property) =>
        shouldRenderProperty(
          property,
          data?.properties,
          connectedHandleSet.has(property.name)
        )
      ),
    [properties, data, connectedHandleSet]
  );

  const allInputs = useMemo(() => shownProperties.map((property, index) => {
    const finalTabIndex = tabIndexMap.get(property.name) ?? -1;

    return (
      <NodeInput
        key={property.name + id}
        id={id}
        nodeType={nodeType}
        layout={layout}
        property={property}
        propertyIndex={index.toString()}
        data={data}
        showFields={showFields}
        showHandle={showHandle}
        tabIndex={finalTabIndex}
        isConnected={connectedHandleSet.has(property.name)}
      />
    );
  }), [shownProperties, tabIndexMap, connectedHandleSet, id, nodeType, layout, data, showFields, showHandle]);

  const dynamicInputs = useMemo(
    () => data?.dynamic_inputs || {},
    [data?.dynamic_inputs]
  );

  // A dynamic input renders whether it arrived with a value
  // (`dynamic_properties`) or as a bare declaration (`dynamic_inputs`) — a
  // graph authored headlessly declares slots without seeding values, and a
  // declared slot with no handle would leave its incoming edge pointing at
  // nothing.
  const dynamicInputNames = useMemo(() => {
    const names = Object.keys(dynamicProperties);
    const seen = new Set(names);
    for (const name of Object.keys(dynamicInputs)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    for (const name of inferredCodeInputNamesFromData(data, nodeType)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }, [dynamicProperties, dynamicInputs, data, nodeType]);

  const dynamicInputElements = useMemo(() => dynamicInputNames.map(
    (name, index) => {
      const incoming = connectedEdgeByHandle.get(name);
      const inputMeta = dynamicInputs[name]
        ? normalizeDynamicSlot(dynamicInputs[name])
        : undefined;

      let resolvedType: TypeMetadata;
      let description: string | undefined;
      if (inputMeta) {
        // A declared slot picks the same PropertyInput a static property of
        // that type gets (number editor, image drop, enum select…).
        const arg0 = inputMeta.type.type_args?.[0];
        resolvedType = {
          ...inputMeta.type,
          values: inputMeta.type.values ?? arg0?.values ?? null
        };
        description = inputMeta.description;
      } else {
        // Unconnected, untyped dynamic input: fall back to the node's
        // declared default type (so a Concat input is an editable `str`,
        // not an uneditable `any`). A connected edge's source type wins.
        resolvedType = defaultDynamicInputType
          ? ({
              ...defaultDynamicInputType,
              type_args: defaultDynamicInputType.type_args ?? [],
              optional: defaultDynamicInputType.optional ?? false
            })
          : ({
              type: "any",
              type_args: [],
              optional: false
            } as TypeMetadata);
        if (incoming) {
          const sourceNode = findNode(incoming.source);
          if (sourceNode) {
            const sourceMeta = getMetadata(sourceNode.type || "");
            const handle = sourceMeta
              ? findOutputHandle(
                  sourceNode,
                  incoming.sourceHandle || "",
                  sourceMeta
                )
              : undefined;
            if (handle?.type) {
              resolvedType = handle.type;
            }
          }
        }
      }

      return (
        <NodeInput
          key={`dynamic-${name}-${id}`}
          id={id}
          nodeType={nodeType}
          layout={layout}
          property={{
            name,
            type: resolvedType,
            required: false,
            ...(description != null && { description }),
            ...(inputMeta?.min != null && { min: inputMeta.min }),
            ...(inputMeta?.max != null && { max: inputMeta.max }),
            ...(inputMeta?.default !== undefined && { default: inputMeta.default })
          }}
          propertyIndex={`dynamic-${index}`}
          data={data}
          showFields={editableDynamicInputs}
          showHandle={true}
          tabIndex={-1}
          isDynamicProperty={true}
          isConnected={!!incoming}
        />
      );
    }
  ), [
    dynamicInputNames,
    connectedEdgeByHandle,
    dynamicInputs,
    id,
    nodeType,
    layout,
    data,
    editableDynamicInputs,
    defaultDynamicInputType,
    findNode,
    getMetadata
  ]);

  return (
    <div className={`node-inputs node-drag-handle node-${id}`} css={rootCss}>
      {allInputs}
      {showDynamicInputs && dynamicInputElements}
    </div>
  );
};

const EMPTY_RECORD: Record<string, unknown> = {};

/** Same keys, and each value the same reference. */
const sameValues = (
  prevMap: Record<string, unknown> | undefined,
  nextMap: Record<string, unknown> | undefined
): boolean => {
  if (prevMap === nextMap) {
    return true;
  }
  const prev = prevMap ?? EMPTY_RECORD;
  const next = nextMap ?? EMPTY_RECORD;
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) {
    return false;
  }
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) {
      return false;
    }
  }
  return true;
};

/**
 * `data` carries the whole node blob, so the deep equal this replaces walked
 * every property value — long prompts, asset refs, dataframes — on each
 * keystroke. Compare the slices the subtree reads: `workflow_id` and the three
 * value maps. `PropertyField` and `PropertyInput` read nothing else, and
 * `NodeInput` narrows further via {@link isFieldRelevantDataEqual}.
 */
const arePropsEqual = (
  prev: NodeInputsProps,
  next: NodeInputsProps
): boolean => {
  if (
    prev.id !== next.id ||
    prev.nodeType !== next.nodeType ||
    prev.layout !== next.layout ||
    prev.showFields !== next.showFields ||
    prev.showHandle !== next.showHandle ||
    prev.editableDynamicInputs !== next.editableDynamicInputs ||
    prev.showDynamicInputs !== next.showDynamicInputs ||
    prev.onUpdatePropertyName !== next.onUpdatePropertyName ||
    prev.onDeleteProperty !== next.onDeleteProperty ||
    // Comes from the metadata store, so one reference per node type.
    prev.nodeMetadata !== next.nodeMetadata
  ) {
    return false;
  }
  if (!isEqual(prev.defaultDynamicInputType, next.defaultDynamicInputType)) {
    return false;
  }
  const prevProperties = prev.properties;
  const nextProperties = next.properties;
  if (
    prevProperties !== nextProperties &&
    (prevProperties.length !== nextProperties.length ||
      prevProperties.some((p, i) => p !== nextProperties[i]))
  ) {
    return false;
  }
  const prevData = prev.data;
  const nextData = next.data;
  if (prevData === nextData) {
    return true;
  }
  return (
    prevData.workflow_id === nextData.workflow_id &&
    sameValues(prevData.properties, nextData.properties) &&
    sameValues(prevData.dynamic_properties, nextData.dynamic_properties) &&
    sameValues(prevData.dynamic_inputs, nextData.dynamic_inputs)
  );
};

export const NodeInputs = memo(NodeInputsImpl, arePropsEqual);
NodeInputs.displayName = "NodeInputs";
export default NodeInputs;
