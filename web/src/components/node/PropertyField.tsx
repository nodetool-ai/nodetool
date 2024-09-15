/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Handle, Position, useStore } from "reactflow";
import { Tooltip, Zoom } from "@mui/material";
import useConnectionStore from "../../stores/ConnectionStore";
import { NodeData } from "../../stores/NodeData";
import { Property } from "../../stores/ApiTypes";
import PropertyInput from "./PropertyInput";
import { isConnectable, typeToString, Slugify } from "../../utils/TypeHandler";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "./BaseNode";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { colorForType, textColorForType } from "../../config/data_types";
import { MIN_ZOOM } from "../../config/constants";
import ThemeNodetool from "../themes/ThemeNodetool";
import useContextMenuStore from "../../stores/ContextMenuStore";

export type PropertyFieldProps = {
  id: string;
  data: NodeData;
  nodeType: string;
  layout?: string;
  property: Property;
  propertyIndex: string;
  isPrimary?: boolean;
  isSecondary?: boolean;
  edgeConnected: boolean;
  onlyInput?: boolean;
  onlyHandle?: boolean;
  isInspector?: boolean;
};

/**
 * PropertyField renders a single property of a node.
 */
const PropertyField: React.FC<PropertyFieldProps> = memo(
  ({
    id,
    data,
    nodeType,
    propertyIndex,
    property,
    onlyInput,
    onlyHandle,
    isInspector,
    edgeConnected
  }) => {
    const controlKeyPressed = useKeyPressedStore((state) =>
      state.isKeyPressed("Control")
    );
    const { connectType, connectDirection, connectNodeId } =
      useConnectionStore();
    const currentZoom = useStore((state) => state.transform[2]);
    const openContextMenu = useContextMenuStore(
      (state) => state.openContextMenu
    );

    const isMinZoom = currentZoom === MIN_ZOOM;
    const showHandle = onlyHandle || !onlyInput;
    const showInput = (onlyInput || !onlyHandle) && !isMinZoom;

    const classConnectable = useMemo(() => {
      return connectType !== null &&
        isConnectable(connectType, property.type) &&
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
          property.type.type,
          property.name
        );
      },
      [id, openContextMenu, property.name, property.type.type]
    );

    const tooltipTitle = useMemo(
      () => (
        <span
          style={{
            backgroundColor: colorForType(property.type.type),
            color: textColorForType(property.type.type),
            borderRadius: ".5em",
            fontSize: ThemeNodetool.fontSizeSmall
          }}
        >
          {property.name}:{typeToString(property.type)}
        </span>
      ),
      [property.name, property.type]
    );

    const tooltipProps = useMemo(
      () => ({
        componentsProps: {
          tooltip: {
            sx: {
              backgroundColor: "transparent !important"
            }
          }
        },
        title: tooltipTitle,
        enterDelay: TOOLTIP_ENTER_DELAY,
        leaveDelay: TOOLTIP_LEAVE_DELAY,
        enterNextDelay: TOOLTIP_ENTER_NEXT_DELAY,
        placement: "left" as const,
        TransitionComponent: Zoom,
        className: `${classConnectable} ${Slugify(property.type.type)}`
      }),
      [tooltipTitle, classConnectable, property.type.type]
    );

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

        {showInput ? (
          <PropertyInput
            propertyIndex={`${id}-${propertyIndex}`}
            id={id}
            data={data}
            nodeType={nodeType}
            property={property}
            controlKeyPressed={controlKeyPressed}
            isInspector={isInspector}
            hideInput={edgeConnected}
            hideLabel={false}
          />
        ) : (
          <div className="property-spacer" style={{ height: "20px" }} />
        )}
      </div>
    );
  }
);

PropertyField.displayName = "PropertyField";

export default PropertyField;
