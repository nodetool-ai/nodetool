/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import PropertyField from "./PropertyField";
import { NodeMetadata, Property, TypeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import isEqual from "lodash/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { findOutputHandle } from "../../utils/handleUtils";
import { Button } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Collapse } from "@mui/material";

export interface NodeInputsProps {
  id: string;
  layout?: string;
  nodeType: string;
  properties: Property[];
  data: NodeData;
  nodeMetadata: NodeMetadata;
  showFields?: boolean;
  showHandle?: boolean;
  showAdvancedFields?: boolean;
  basicFields?: string[];
  hasAdvancedFields?: boolean;
  onToggleAdvancedFields?: () => void;
  onUpdatePropertyName?: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
  onDeleteProperty?: (propertyName: string) => void;
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
  showAdvancedFields?: boolean;
  basicFields?: string[];
  isDynamicProperty?: boolean;
  onDeleteProperty?: (propertyName: string) => void;
  onUpdatePropertyName?: (
    oldPropertyName: string,
    newPropertyName: string
  ) => void;
}

const NodeInput: React.FC<NodeInputProps> = memo(function NodeInput({
  id,
  nodeType,
  layout,
  property,
  propertyIndex,
  data,
  showFields,
  showHandle,
  tabIndex,
  showAdvancedFields,
  basicFields,
  isDynamicProperty
}) {
  const { edges, findNode } = useNodes((state) => ({
    edges: state.edges,
    findNode: state.findNode
  }));

  const isConstantNode = property.type.type.startsWith("nodetool.constant");
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) => edge.target === id && edge.targetHandle === property.name
    );
  }, [edges, id, property.name]);

  const isBasicField = useMemo(() => {
    return basicFields?.includes(property.name);
  }, [basicFields, property.name]);
  const isAdvancedField = !isBasicField && !isDynamicProperty;

  if (isAdvancedField && !isConnected && !showAdvancedFields) {
    return null;
  }
  // Resolve the current value for this input. Use dynamic_properties for
  // dynamic inputs; otherwise use properties. Fallback to the property's
  // default when undefined to avoid runtime errors.
  const resolvedValue = isDynamicProperty
    ? data?.dynamic_properties?.[property.name] ?? property.default
    : data?.properties?.[property.name] ?? property.default;

  return (
    <PropertyField
      key={`${isDynamicProperty ? "dynamic-" : ""}${property.name}-${id}`}
      id={id}
      value={resolvedValue}
      nodeType={nodeType}
      layout={layout}
      property={property}
      propertyIndex={propertyIndex}
      showFields={showFields}
      showHandle={showHandle && !isConstantNode}
      tabIndex={tabIndex}
      isDynamicProperty={isDynamicProperty}
      data={data}
    />
  );
},
isEqual);

export const NodeInputs: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeMetadata,
  nodeType,
  showHandle = true,
  showFields = true,
  layout,
  showAdvancedFields,
  basicFields,
  hasAdvancedFields,
  onToggleAdvancedFields
}) => {
  const tabableProperties = properties.filter((property) => {
    const type = property.type;
    return !type.optional && type.type !== "readonly";
  });
  const dynamicProperties: { [key: string]: Property } =
    data?.dynamic_properties || {};

  const basicInputs: JSX.Element[] = [];
  const advancedInputs: JSX.Element[] = [];
  const { edges, findNode } = useNodes((state) => ({
    edges: state.edges,
    findNode: state.findNode
  }));
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const isConnected = useCallback(
    (handle: string) => {
      return edges.some(
        (edge) => edge.target === id && edge.targetHandle === handle
      );
    },
    [edges, id]
  );

  properties.forEach((property, index) => {
    const tabIndex = tabableProperties.findIndex(
      (p) => p.name === property.name
    );
    const finalTabIndex = tabIndex !== -1 ? tabIndex + 1 : -1;
    const isBasicField = basicFields?.includes(property.name);

    const inputElement = (
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
        showAdvancedFields={showAdvancedFields}
        basicFields={basicFields}
      />
    );

    if (isBasicField || isConnected(property.name)) {
      basicInputs.push(inputElement);
    } else {
      advancedInputs.push(inputElement);
    }
  });

  const dynamicInputElements = Object.entries(dynamicProperties).map(
    ([name], index) => {
      // Determine type from incoming edge's source handle
      const incoming = edges.find(
        (edge) => edge.target === id && edge.targetHandle === name
      );
      let resolvedType: TypeMetadata = {
        type: "any",
        type_args: [],
        optional: false
      } as any;
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
      return (
        <NodeInput
          key={`dynamic-${name}-${id}`}
          id={id}
          nodeType={nodeType}
          layout={layout}
          property={{
            name,
            type: resolvedType,
            required: false
          }}
          propertyIndex={`dynamic-${index}`}
          data={data}
          showFields={true}
          showHandle={true}
          tabIndex={-1}
          isDynamicProperty={true}
        />
      );
    }
  );

  return (
    <div className={`node-inputs node-drag-handle node-${id}`}>
      {basicInputs}

      {hasAdvancedFields && (
        <div className="expand-button-container">
          <Tooltip
            title={`${showAdvancedFields ? "Hide" : "Show"} Advanced Fields`}
            placement="bottom"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              className={`advanced-fields-button${
                showAdvancedFields ? " active" : ""
              }`}
              tabIndex={-1}
              onClick={onToggleAdvancedFields}
              size="small"
              variant="text"
            >
              <ExpandMoreIcon /> {showAdvancedFields ? "Less" : "More"}
            </Button>
          </Tooltip>
        </div>
      )}

      {advancedInputs.length > 0 && (
        <Collapse
          in={showAdvancedFields}
          timeout={300}
          mountOnEnter
          unmountOnExit
        >
          <div className="advanced-fields-container">{advancedInputs}</div>
        </Collapse>
      )}

      {dynamicInputElements}
    </div>
  );
};

export default memo(NodeInputs, isEqual);
