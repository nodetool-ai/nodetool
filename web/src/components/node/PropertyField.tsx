/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { css, Tooltip, Zoom } from "@mui/material";
import useConnectionStore from "../../stores/ConnectionStore";
import { Property } from "../../stores/ApiTypes";
import PropertyInput from "./PropertyInput";
import { typeToString, Slugify } from "../../utils/TypeHandler";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { colorForType, textColorForType } from "../../config/data_types";
import ThemeNodetool from "../themes/ThemeNodetool";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { isEqual } from "lodash";
import { useNodeStore } from "../../stores/NodeStore";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import { Close } from "@mui/icons-material";

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
  isBasicField?: boolean;
  showAdvancedFields?: boolean;
  isDynamicProperty?: boolean;
  onDeleteProperty?: (propertyName: string) => void;
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
  showAdvancedFields,
  isBasicField,
  isDynamicProperty,
  onDeleteProperty
}) => {
  const edges = useNodeStore((state) => state.edges);
  const controlKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Control")
  );
  const metaKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Meta")
  );
  const { connectType, connectDirection, connectNodeId } = useConnectionStore();
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) => edge.target === id && edge.targetHandle === property.name
    );
  }, [id, property.name, edges]);

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const hideField = !isConnected && !isBasicField && !showAdvancedFields;
  const classConnectable = useMemo(() => {
    return connectType !== null &&
      isConnectableCached(connectType, property.type) &&
      connectNodeId !== id &&
      connectDirection === "source"
      ? "is-connectable"
      : "not-connectable";
  }, [connectDirection, connectNodeId, connectType, id, property.type]);

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
    [id, openContextMenu, property.name, property.type.type]
  );

  const updateNodeData = useNodeStore((state) => state.updateNodeData);

  const tooltipTitle = useMemo(
    () => (
      <span
        style={{
          backgroundColor: colorForType(property.type.type),
          color: textColorForType(property.type.type),
          borderRadius: ".5em",
          fontSize: ThemeNodetool.fontSizeBig
        }}
      >
        {typeToString(property.type)}
      </span>
    ),
    [property.type]
  );

  const tooltipProps = useMemo(
    () => ({
      slotProps: {
        transition: Zoom,
        tooltip: {
          className: "tooltip-handle"
        }
      },
      title: tooltipTitle,
      enterDelay: TOOLTIP_ENTER_DELAY,
      leaveDelay: TOOLTIP_LEAVE_DELAY,
      enterNextDelay: TOOLTIP_ENTER_NEXT_DELAY,
      placement: "left" as const,
      className: `${classConnectable} ${Slugify(property.type.type)}`
    }),
    [tooltipTitle, classConnectable, property.type.type]
  );
  if (hideField) {
    return null;
  }

  return (
    <div className={`node-property ${Slugify(property.type.type)}`}>
      {showHandle && (
        <div className="handle-popup">
          <Tooltip {...tooltipProps}>
            <Handle
              type="target"
              id={property.name}
              position={Position.Left}
              isConnectable={true}
              className={Slugify(property.type.type)}
              onContextMenu={handleContextMenu}
            />
          </Tooltip>
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
          />
          {isDynamicProperty && onDeleteProperty && (
            <Close
              css={css({
                fontSize: "1em",
                cursor: "pointer",
                marginTop: "1.5em",
                marginLeft: "0.5em",
                opacity: 0.6,
                "&:hover": {
                  opacity: 1
                }
              })}
              onClick={() => onDeleteProperty(property.name)}
            />
          )}
        </>
      ) : (
        <div className="property-spacer" style={{ height: "20px" }} />
      )}
    </div>
  );
};

export default memo(PropertyField, isEqual);
