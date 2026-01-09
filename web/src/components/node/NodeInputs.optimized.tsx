/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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

// ============================================================================
// OPTIMIZATION 1: Extract static styles outside component
// ============================================================================
const rootStyles = css({
  marginTop: "0.5em"
});

const expandButtonContainerStyles = css({
  display: "flex",
  justifyContent: "center",
  margin: "4px 0"
});

// ============================================================================
// NodeInput Component - Already well optimized with memo
// ============================================================================
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
  // ============================================================================
  // OPTIMIZATION 2: Use separate selectors instead of object creation
  // ============================================================================
  const edges = useNodes((state) => state.edges);

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

// ============================================================================
// Main NodeInputs Component
// ============================================================================
export const NodeInputs: React.FC<NodeInputsProps> = ({
  id,
  properties,
  data,
  nodeType,
  showHandle = true,
  showFields = true,
  layout,
  showAdvancedFields,
  basicFields,
  hasAdvancedFields,
  onToggleAdvancedFields
}) => {
  // ============================================================================
  // OPTIMIZATION 3: Use separate selectors to avoid object creation
  // ============================================================================
  const edges = useNodes((state) => state.edges);
  const findNode = useNodes((state) => state.findNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  // ============================================================================
  // OPTIMIZATION 4: Memoize tabable properties calculation
  // ============================================================================
  const tabableProperties = useMemo(() => {
    return properties.filter((property) => {
      const type = property.type;
      return !type.optional && type.type !== "readonly";
    });
  }, [properties]);

  const dynamicProperties: { [key: string]: Property } = useMemo(
    () => data?.dynamic_properties || {},
    [data?.dynamic_properties]
  );

  // ============================================================================
  // OPTIMIZATION 5: Memoize isConnected callback
  // ============================================================================
  const isConnected = useCallback(
    (handle: string) => {
      return edges.some(
        (edge) => edge.target === id && edge.targetHandle === handle
      );
    },
    [edges, id]
  );

  // ============================================================================
  // OPTIMIZATION 6: Memoize basic and advanced inputs computation
  // ============================================================================
  const { basicInputs, advancedInputs } = useMemo(() => {
    const basic: JSX.Element[] = [];
    const advanced: JSX.Element[] = [];

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
        basic.push(inputElement);
      } else {
        advanced.push(inputElement);
      }
    });

    return { basicInputs: basic, advancedInputs: advanced };
  }, [
    properties,
    tabableProperties,
    basicFields,
    id,
    nodeType,
    layout,
    data,
    showFields,
    showHandle,
    showAdvancedFields,
    isConnected
  ]);

  // ============================================================================
  // OPTIMIZATION 7: Memoize dynamic input elements computation
  // ============================================================================
  const dynamicInputElements = useMemo(() => {
    return Object.entries(dynamicProperties).map(([name], index) => {
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
    });
  }, [dynamicProperties, edges, id, findNode, getMetadata, nodeType, layout, data]);

  // ============================================================================
  // OPTIMIZATION 8: Memoize expand button sx styles
  // ============================================================================
  const expandButtonSx = useCallback((theme: any) => ({
    margin: "0 2px",
    padding: "0.1em 1em 0.1em 0.5em",
    minWidth: 0,
    fontSize: "0.7rem",
    color: theme.vars.palette.grey[500],
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    "&:hover": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[0]
    },
    "& .MuiSvgIcon-root": {
      transition: "transform 0.3s ease, color 0.2s ease",
      fontSize: "1rem",
      verticalAlign: "middle",
      marginRight: "2px",
      transform: showAdvancedFields
        ? "rotate(180deg) scale(0.7)"
        : "scale(0.7)",
      color: showAdvancedFields
        ? theme.vars.palette.primary.main
        : "inherit"
    }
  }), [showAdvancedFields]);

  return (
    <div className={`node-inputs node-drag-handle node-${id}`} css={rootStyles}>
      {basicInputs}

      {hasAdvancedFields && (
        <div className="expand-button-container" css={expandButtonContainerStyles}>
          <Tooltip
            title={`${showAdvancedFields ? "Hide" : "Show"} Advanced Fields`}
            placement="bottom"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              tabIndex={-1}
              onClick={onToggleAdvancedFields}
              size="small"
              variant="text"
              sx={expandButtonSx}
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
