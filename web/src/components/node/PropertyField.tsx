/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useMemo } from "react";

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
const PropertyField: React.FC<PropertyFieldProps> = ({
  id,
  data,
  nodeType,
  propertyIndex,
  property,
  onlyInput,
  onlyHandle,
  isInspector,
  edgeConnected
}: PropertyFieldProps) => {
  const controlKeyPressed = useKeyPressedStore((state) => state.isKeyPressed("Control"));
  const { connectType, connectDirection, connectNodeId } = useConnectionStore((state) => ({
    connectType: state.connectType,
    connectDirection: state.connectDirection,
    connectNodeId: state.connectNodeId
  }));
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom === MIN_ZOOM;
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const inputContextMenu = (event: any, id: string, type: string) => {
    setTimeout(() => {
      openContextMenu(
        "input-context-menu",
        id,
        event.clientX - 260,
        event.clientY - 50,
        "react-flow__pane",
        type,
        property.name
      );
    }, 0);
  };

  const classConnectable = useMemo(() => {
    const propType = property.type;
    return connectType !== null &&
      isConnectable(connectType, propType) &&
      connectNodeId !== id &&
      connectDirection === "source"
      ? "is-connectable"
      : "not-connectable";
  }, [connectDirection, connectNodeId, connectType, id, property.type]);

  const showHandle = onlyHandle || !onlyInput;
  const showInput = (onlyInput || !onlyHandle) && !isMinZoom;

  return (
    <div key={id} className={"node-property " + Slugify(property.type.type)}>
      {showHandle && (
        <div className="handle-popup">
          <Tooltip
            componentsProps={{
              tooltip: {
                sx: {
                  backgroundColor: "transparent !important"
                }
              }
            }}
            title={
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
            }
            enterDelay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement="left"
            TransitionComponent={Zoom}
            className={classConnectable + " " + Slugify(property.type.type)}
          >
            <Handle
              type="target"
              id={property.name}
              position={Position.Left}
              isConnectable={true}
              className={Slugify(property.type.type)}
              onContextMenu={(e) => inputContextMenu(e, id, property.type.type)}
            />
          </Tooltip>
        </div>
      )}

      {showInput ? (
        <>
          <PropertyInput
            propertyIndex={id + "-" + propertyIndex}
            id={id}
            data={data}
            nodeType={nodeType}
            property={property}
            controlKeyPressed={controlKeyPressed}
            isInspector={isInspector}
            hideInput={edgeConnected}
            hideLabel={false}
          />
        </>
      ) : (
        <div className="property-spacer" style={{ height: "20px" }}></div>
      )}
    </div>
  );
};

export default memo(PropertyField);
