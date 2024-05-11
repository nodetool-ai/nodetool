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

import useKeyPressedListener from "../../utils/KeyPressedListener";
import { colorForType, textColorForType } from "../../config/data_types";
import { MIN_ZOOM } from "../../config/constants";
import ThemeNodetool from "../themes/ThemeNodetool";
import useContextMenuStore from "../../stores/ContextMenuStore";

export type PropertyFieldProps = {
  id: string;
  data: NodeData;
  layout: string;
  property: Property;
  propertyIndex: string;
  isPrimary?: boolean;
  isSecondary?: boolean;
  edgeConnected: boolean;
  skipHandles?: boolean;
  isInspector?: boolean;
};

/**
 * PropertyField renders a single property of a node.
 */
const PropertyField: React.FC<PropertyFieldProps> = (props) => {
  const controlKeyPressed = useKeyPressedListener("Control");
  const { propertyIndex } = props;
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore(
    (state) => state.connectDirection
  );
  const connectNodeId = useConnectionStore((state) => state.connectNodeId);
  const { property } = props;
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom === MIN_ZOOM;

  const { openContextMenu } = useContextMenuStore();
  const inputContextMenu = (event: any, id: string, type: string) => {
    setTimeout(() => {
      openContextMenu(
        "input-context-menu",
        id,
        event.clientX - 260,
        event.clientY - 50,
        "react-flow__pane",
        type,
        props.property.name
      );
    }, 0);
  };

  const classConnectable = useMemo(() => {
    const propType = props.property.type;
    return connectType !== null &&
      isConnectable(connectType, propType) &&
      connectNodeId !== props.id &&
      connectDirection === "source"
      ? "is-connectable"
      : "not-connectable";
  }, [
    connectDirection,
    connectNodeId,
    connectType,
    props.id,
    props.property.type
  ]);
  return (
    <div
      key={props.id}
      className={"node-property " + Slugify(property.type.type)}
    >
      {!props.skipHandles && (
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
                  backgroundColor: colorForType(props.property.type.type),
                  color: textColorForType(props.property.type.type),
                  borderRadius: ".5em",
                  fontSize: ThemeNodetool.fontSizeSmall
                }}
              >
                {props.property.name}:
                {typeToString(props.property.type)}
              </span>
            }
            enterDelay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement="left"
            TransitionComponent={Zoom}
            className={
              classConnectable + " " + Slugify(props.property.type.type)
            }
          >
            <Handle
              type="target"
              id={props.property.name}
              position={Position.Left}
              isConnectable={true}
              className={Slugify(props.property.type.type)}
              onContextMenu={(e) =>
                inputContextMenu(e, props.id, props.property.type.type)
              }
            />
          </Tooltip>
        </div>
      )}

      {!isMinZoom ? (
        <>
          <PropertyInput
            propertyIndex={props.id + "-" + propertyIndex}
            id={props.id}
            data={props.data}
            property={props.property}
            controlKeyPressed={controlKeyPressed}
            isInspector={props.isInspector}
            hideInput={props.edgeConnected}
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
