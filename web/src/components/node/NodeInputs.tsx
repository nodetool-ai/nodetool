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
import { isFieldRelevantDataEqual } from "./propertyFieldEquality";


const rootCss = css({
  marginTop: "1em",
  marginBottom: "0.5em"
});

export interface NodeInputsProps {
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

  const allInputs = useMemo(() => properties.map((property, index) => {
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
  }), [properties, tabIndexMap, connectedHandleSet, id, nodeType, layout, data, showFields, showHandle]);

  const dynamicInputs = useMemo(
    () => data?.dynamic_inputs || {},
    [data?.dynamic_inputs]
  );

  const dynamicInputElements = useMemo(() => Object.entries(dynamicProperties).map(
    ([name], index) => {
      const incoming = connectedEdgeByHandle.get(name);
      const inputMeta = dynamicInputs[name];

      let resolvedType: TypeMetadata;
      let description: string | undefined;
      if (inputMeta) {
          type DynMeta = typeof inputMeta & { enum?: (string | number)[] };
          type DynTypeArg = TypeMetadata & { enum?: (string | number)[] };
          const meta = inputMeta as DynMeta;
          const arg0 = inputMeta.type_args?.[0] as DynTypeArg | undefined;
          resolvedType = {
            ...inputMeta,
            type: inputMeta.type,
            type_args: inputMeta.type_args ?? [],
            optional: inputMeta.optional ?? false,
            values: inputMeta.values || meta.enum || arg0?.values || arg0?.enum,
          } as TypeMetadata;
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
            } as TypeMetadata)
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
    dynamicProperties,
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

export const NodeInputs = memo(NodeInputsImpl, isEqual);
NodeInputs.displayName = "NodeInputs";
export default NodeInputs;
