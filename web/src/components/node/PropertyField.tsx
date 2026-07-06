/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import usePropertyHighlightStore from "../../stores/PropertyHighlightStore";
import useConnectionStore from "../../stores/ConnectionStore";
import { useShallow } from "zustand/react/shallow";
import { Property } from "../../stores/ApiTypes";
import PropertyInput from "./PropertyInput";
import PropertyLabel from "./PropertyLabel";
import { Slugify, isCollectType } from "../../utils/TypeHandler";
import useContextMenuStore from "../../stores/ContextMenuStore";
import isEqual from "fast-deep-equal";
import { isFieldRelevantDataEqual } from "./propertyFieldEquality";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";
import { NodeData } from "../../stores/NodeData";
import usePropertyValidationStore from "../../stores/PropertyValidationStore";
import { Tooltip, BORDER_RADIUS, MOTION, reducedMotion } from "../ui_primitives";
import useModelCalloutStore from "../../stores/ModelCalloutStore";
import { isModelEmpty } from "../../utils/findMissingModelNodes";
import ModelSetupCallout from "./ModelSetupCallout";

const highlightBlink = keyframes({
  "0%, 100%": {
    outlineColor: "var(--palette-primary-light)",
    boxShadow: "0 0 18px 4px rgba(var(--palette-primary-mainChannel) / 0.85)"
  },
  "50%": {
    outlineColor: "rgba(var(--palette-primary-mainChannel) / 0)",
    boxShadow: "0 0 18px 4px rgba(var(--palette-primary-mainChannel) / 0)"
  }
});

const highlightStyle = css({
  borderRadius: BORDER_RADIUS.sm,
  outline: "2px solid var(--palette-primary-light)",
  outlineOffset: 2,
  // Blink the outline + glow fully on and off to draw the eye to an unset
  // model. Runs until the highlight store clears it (HIGHLIGHT_DURATION_MS).
  animation: `${highlightBlink} ${MOTION.pulse} infinite`,
  ...reducedMotion({ animation: "none" })
});

const HANDLE_POPUP_STYLE = { position: "absolute" as const, left: "0" };
const PROPERTY_SPACER_STYLE = {
  marginLeft: 8,
  minHeight: 20,
  display: "flex" as const,
  alignItems: "center" as const
};

export type PropertyFieldProps = {
  id: string;
  value: unknown;
  nodeType: string;
  layout?: string;
  property: Property;
  propertyIndex: string;
  showFields?: boolean;
  showHandle?: boolean;
  isInspector?: boolean;
  /** When the inspector edits multiple nodes at once, reset/context actions apply to these ids. */
  inspectorBatchNodeIds?: readonly string[];
  tabIndex?: number;
  isDynamicProperty?: boolean;
  hideActionIcons?: boolean;
  data: NodeData;
  /** True when an edge is connected to this property's target handle. */
  isConnected?: boolean;
  onValueChange?: (value: unknown) => void;
};

/**
 * PropertyField renders a single property of a node.
 */
const PropertyField: React.FC<PropertyFieldProps> = ({
  id,
  value,
  nodeType,
  propertyIndex,
  property,
  showFields = true,
  showHandle = true,
  isInspector,
  inspectorBatchNodeIds,
  tabIndex,
  isDynamicProperty,
  hideActionIcons,
  data,
  isConnected = false,
  onValueChange
}) => {
  const { connectType, connectDirection, connectNodeId } = useConnectionStore(
    useShallow((state) => ({
      connectType: state.connectType,
      connectDirection: state.connectDirection,
      connectNodeId: state.connectNodeId
    }))
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  // Transient highlight (e.g. guiding the user to set a model). Only in the
  // inspector, where we also scroll the field into view.
  const highlightToken = usePropertyHighlightStore((state) =>
    isInspector &&
    state.nodeId === id &&
    state.propertyName === property.name
      ? state.token
      : null
  );
  const isHighlighted = highlightToken !== null;
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isHighlighted && fieldRef.current) {
      fieldRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted, highlightToken]);

  // Inline "set a model" call-out, shown in the inspector when a run was
  // blocked for this unset model field. Clears itself once a model is picked.
  const showCallout = useModelCalloutStore((state) =>
    Boolean(isInspector) && state.has(id, property.name)
  );
  const resolveCallout = useModelCalloutStore((state) => state.resolve);
  const dismissCallout = useCallback(() => {
    resolveCallout(id, property.name);
  }, [resolveCallout, id, property.name]);
  useEffect(() => {
    if (showCallout && !isModelEmpty(value)) {
      resolveCallout(id, property.name);
    }
  }, [showCallout, value, resolveCallout, id, property.name]);

  const validationError = usePropertyValidationStore((state) =>
    data.workflow_id
      ? state.errors[`${data.workflow_id}:${id}:${property.name}` as const]
      : undefined
  );
  const classConnectable = useMemo(() => {
    // Control edges can connect to any node's control handle
    if (connectType?.type === "control") {
      return "is-connectable";
    }
    return connectType &&
      isConnectableCached(connectType, property.type) &&
      connectNodeId !== id &&
      connectDirection === "source"
      ? "is-connectable"
      : "not-connectable";
  }, [connectDirection, connectNodeId, connectType, id, property.type]);

  // Check if this is a "collect" handle (list[T] that can accept multiple connections)
  const isCollectHandle = useMemo(() => {
    return isCollectType(property.type);
  }, [property.type]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(
        "input-context-menu",
        id,
        event.clientX - 260,
        event.clientY - 50,
        "react-flow__pane",
        property.type,
        property.name,
        property.description || undefined,
        undefined,
        inspectorBatchNodeIds?.length
          ? { inspectorBatchNodeIds }
          : undefined
      );
    },
    [
      id,
      inspectorBatchNodeIds,
      openContextMenu,
      property.description,
      property.name,
      property.type
    ]
  );

  const fieldClass = `node-property ${Slugify(property.type.type)}${
    validationError ? " has-validation-error" : ""
  }${isConnected ? " is-connected" : ""}`;

  const inner = (
    <div
      ref={fieldRef}
      className={fieldClass}
      data-property={property.name}
      css={isHighlighted ? highlightStyle : undefined}
    >
      {showHandle && (
        <div className="handle-popup" style={HANDLE_POPUP_STYLE}>
          <HandleTooltip
            typeMetadata={property.type}
            paramName={property.name}
            className={classConnectable}
            handlePosition="left"
            enableHover={true}
          >
            <Handle
              type="target"
              id={property.name}
              position={Position.Left}
              isConnectable={true}
              className={`${Slugify(property.type.type)} ${classConnectable}${isCollectHandle ? " collect-handle" : ""}`}
              onContextMenu={handleContextMenu}
            />
          </HandleTooltip>
        </div>
      )}

      {showFields ? (
        <>
          <PropertyInput
            propertyIndex={`${id}-${propertyIndex}`}
            id={id}
            value={value}
            nodeType={nodeType}
            property={property}
            isInspector={isInspector}
            tabIndex={tabIndex}
            isDynamicProperty={isDynamicProperty}
            hideActionIcons={hideActionIcons}
            data={data}
            inspectorBatchNodeIds={inspectorBatchNodeIds}
            isConnected={isInspector ? isConnected : false}
            onValueChange={onValueChange}
          />
        </>
      ) : (
        <div className="property-spacer" style={PROPERTY_SPACER_STYLE}>
          <PropertyLabel
            id={id}
            name={property.name}
            description={property.description ?? undefined}
            isDynamicProperty={isDynamicProperty ?? false}
            density="compact"
            handleTooltipType={property.type}
            handleTooltipPosition="left"
          />
        </div>
      )}
    </div>
  );

  const field = validationError ? (
    <Tooltip title={validationError} placement="top" arrow enterDelay={250}>
      {inner}
    </Tooltip>
  ) : (
    inner
  );

  if (!showCallout) return field;
  return (
    <>
      {field}
      <ModelSetupCallout onDismiss={dismissCallout} />
    </>
  );
};

export default memo(PropertyField, (prev, next) => {
  if (
    prev.id !== next.id ||
    prev.nodeType !== next.nodeType ||
    prev.layout !== next.layout ||
    prev.propertyIndex !== next.propertyIndex ||
    prev.showFields !== next.showFields ||
    prev.showHandle !== next.showHandle ||
    prev.isInspector !== next.isInspector ||
    prev.tabIndex !== next.tabIndex ||
    prev.isDynamicProperty !== next.isDynamicProperty ||
    prev.hideActionIcons !== next.hideActionIcons ||
    prev.isConnected !== next.isConnected ||
    prev.onValueChange !== next.onValueChange
  ) {
    return false;
  }
  if (!isEqual(prev.inspectorBatchNodeIds, next.inspectorBatchNodeIds)) {
    return false;
  }
  if (!isFieldRelevantDataEqual(prev.data, next.data, prev.isDynamicProperty)) {
    return false;
  }
  if (!isEqual(prev.value, next.value)) {
    return false;
  }
  return isEqual(prev.property, next.property);
});
