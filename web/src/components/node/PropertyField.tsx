/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Property } from "../../stores/ApiTypes";
import PropertyInput from "./PropertyInput";
import PropertyLabel from "./PropertyLabel";
import { Slugify, isCollectType } from "../../utils/TypeHandler";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import isEqual from "lodash/isEqual";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";
import { NodeData } from "../../stores/NodeData";

export type PropertyFieldProps = {
  id: string;
  value: any;
  nodeType: string;
  layout?: string;
  property: Property;
  propertyIndex: string;
  showFields?: boolean;
  showHandle?: boolean;
  isInspector?: boolean;
  tabIndex?: number;
  isDynamicProperty?: boolean;
  hideActionIcons?: boolean;
  data: NodeData;
  onValueChange?: (value: any) => void;
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
  tabIndex,
  isDynamicProperty,
  hideActionIcons,
  data,
  onValueChange
}) => {
  const controlKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Control")
  );
  const metaKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Meta")
  );

  // Combine connection store subscriptions into a single selector to reduce re-renders
  const { connectType, connectDirection, connectNodeId } = useConnectionStore(
    useMemo(
      () => (state) => ({
        connectType: state.connectType,
        connectDirection: state.connectDirection,
        connectNodeId: state.connectNodeId
      }),
      []
    )
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const classConnectable = useMemo(() => {
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

  // Memoize inline styles to prevent recreation on every render
  const handlePopupStyle = useMemo(
    () => ({ position: "absolute" as const, left: "0" }),
    []
  );

  const propertySpacerStyle = useMemo(
    () => ({
      marginLeft: 20,
      minHeight: 20,
      display: "flex" as const,
      alignItems: "center" as const
    }),
    []
  );

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
        property.description || undefined
      );
    },
    [id, openContextMenu, property.description, property.name, property.type]
  );

  return (
    <div className={`node-property ${Slugify(property.type.type)}`}>
      {showHandle && (
        <div className="handle-popup" style={handlePopupStyle}>
          <HandleTooltip
            typeMetadata={property.type}
            paramName={property.name}
            className={classConnectable}
            handlePosition="left"
            isCollectInput={isCollectHandle}
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
            controlKeyPressed={controlKeyPressed || metaKeyPressed}
            isInspector={isInspector}
            tabIndex={tabIndex}
            isDynamicProperty={isDynamicProperty}
            hideActionIcons={hideActionIcons}
            data={data}
            onValueChange={onValueChange}
          />
        </>
      ) : (
        <div className="property-spacer" style={propertySpacerStyle}>
          <PropertyLabel
            id={id}
            name={property.name}
            description={property.description ?? undefined}
            isDynamicProperty={isDynamicProperty ?? false}
            density="compact"
          />
        </div>
      )}
    </div>
  );
};

export default memo(PropertyField, isEqual);
