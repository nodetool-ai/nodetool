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
import { shallow } from "zustand/shallow";

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
  editableDynamicInputs?: boolean;
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
  isConnected: boolean;
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
  isDynamicProperty,
  isConnected
}) {
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
      showHandle={showHandle}
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
  nodeType,
  showHandle = true,
  showFields = true,
  layout,
  showAdvancedFields,
  basicFields,
  hasAdvancedFields,
  onToggleAdvancedFields,
  editableDynamicInputs = true
}) => {
  const rootStyles = useMemo(
    () =>
      css({
        marginTop: "1em",
        marginBottom: "0.5em"
      }),
    []
  );

  const expandButtonContainerStyles = useMemo(
    () =>
      css({
        display: "flex",
        justifyContent: "center",
        margin: "4px 0"
      }),
    []
  );

  const tabableProperties = useMemo(
    () =>
      properties.filter((property) => {
        const type = property.type;
        return !type.optional && type.type !== "readonly";
      }),
    [properties]
  );
  const dynamicProperties: { [key: string]: Property } =
    (data?.dynamic_properties || {}) as { [key: string]: Property };

  const basicInputs: JSX.Element[] = [];
  const advancedInputs: JSX.Element[] = [];

  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { edges, findNode } = useNodes(
    (state) => ({
      edges: state.edges,
      findNode: state.findNode
    }),
    shallow
  );
  const connectedEdges = useMemo(
    () => edges.filter((e) => e.target === id),
    [edges, id]
  );

  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const isConnected = useCallback(
    (handle: string) => {
      // Edges are already filtered by target === id
      return connectedEdges.some((edge) => edge.targetHandle === handle);
    },
    [connectedEdges]
  );

  properties.forEach((property, index) => {
    const tabIndex = tabableProperties.findIndex(
      (p) => p.name === property.name
    );
    const finalTabIndex = tabIndex !== -1 ? tabIndex + 1 : -1;
    const isBasicField = basicFields?.includes(property.name);

    const connected = isConnected(property.name);

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
        isConnected={connected}
      />
    );

    if (isBasicField || connected) {
      basicInputs.push(inputElement);
    } else {
      advancedInputs.push(inputElement);
    }
  });

  const dynamicInputs = data?.dynamic_inputs || {};

  const dynamicInputElements = Object.entries(dynamicProperties).map(
    ([name], index) => {
      const incoming = connectedEdges.find(
        (edge) => edge.targetHandle === name
      );
      const inputMeta = dynamicInputs[name];

      let resolvedType: TypeMetadata;
      let description: string | undefined;
      if (inputMeta) {
        resolvedType = {
          ...inputMeta,
          type: inputMeta.type,
          type_args: inputMeta.type_args ?? [],
          optional: inputMeta.optional ?? false,
          values: inputMeta.values || (inputMeta as any).enum || (inputMeta.type_args?.[0] as any)?.values || (inputMeta.type_args?.[0] as any)?.enum,
        } as TypeMetadata;
        description = inputMeta.description;
      } else {
        resolvedType = {
          type: "any",
          type_args: [],
          optional: false
        } as TypeMetadata;
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
  );

  return (
    <div className={`node-inputs node-drag-handle node-${id}`} css={rootStyles}>
      {basicInputs}

      {hasAdvancedFields && (
        <div
          className="expand-button-container"
          css={expandButtonContainerStyles}
        >
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
              sx={(theme) => ({
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
              })}
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
