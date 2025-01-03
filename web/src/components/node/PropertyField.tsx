/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Tooltip, Zoom } from "@mui/material";
import useConnectionStore from "../../stores/ConnectionStore";
import { Property } from "../../stores/ApiTypes";
import PropertyInput from "./PropertyInput";
import { isConnectable, typeToString, Slugify } from "../../utils/TypeHandler";
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

export type PropertyFieldProps = {
  id: string;
  value: any;
  nodeType: string;
  layout?: string;
  property: Property;
  propertyIndex: string;
  onlyInput?: boolean;
  onlyHandle?: boolean;
  isInspector?: boolean;
  tabIndex?: number;
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
  onlyInput,
  onlyHandle,
  isInspector,
  tabIndex
}) => {
  const controlKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Control")
  );
  const metaKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("Meta")
  );
  const { connectType, connectDirection, connectNodeId } = useConnectionStore();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const showHandle = onlyHandle || !onlyInput;
  const showInput = onlyInput || !onlyHandle;

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
          value={value}
          nodeType={nodeType}
          property={property}
          controlKeyPressed={controlKeyPressed || metaKeyPressed}
          isInspector={isInspector}
          hideInput={false}
          hideLabel={false}
          tabIndex={tabIndex}
        />
      ) : (
        <div className="property-spacer" style={{ height: "20px" }} />
      )}
    </div>
  );
};

export default memo(PropertyField, isEqual);
