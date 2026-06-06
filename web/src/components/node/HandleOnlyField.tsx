/** @jsxImportSource @emotion/react */
/**
 * HandleOnlyField
 *
 * Renders a single target handle for a node property — no label, no
 * editor, no value rendering. Used by `HandleColumn` for properties
 * classified as `inputFields` (data wired from upstream).
 *
 * Compare with `PropertyField`, which renders the full handle + label
 * + editor row. This component is the minimal counterpart.
 */

import React, { memo, useMemo } from "react";
import isEqual from "fast-deep-equal";
import { Handle, Position } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { css } from "@emotion/react";

import useConnectionStore from "../../stores/ConnectionStore";
import { Property } from "../../stores/ApiTypes";
import { Slugify, isCollectType } from "../../utils/TypeHandler";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";

const styles = css({
  position: "relative",
  width: "100%",
  height: "100%",
  pointerEvents: "auto"
});

export interface HandleOnlyFieldProps {
  /** Node id this handle belongs to */
  id: string;
  /** The property whose target handle we render */
  property: Property;
  /** True when an edge is already connected to this handle */
  isConnected?: boolean;
}

const HandleOnlyFieldImpl: React.FC<HandleOnlyFieldProps> = ({
  id,
  property,
  isConnected = false
}) => {
  const { connectType, connectDirection, connectNodeId } = useConnectionStore(
    useShallow((state) => ({
      connectType: state.connectType,
      connectDirection: state.connectDirection,
      connectNodeId: state.connectNodeId
    }))
  );

  const classConnectable = useMemo(() => {
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

  const isCollectHandle = useMemo(
    () => isCollectType(property.type),
    [property.type]
  );

  const fieldClass = `node-property handle-only ${Slugify(property.type.type)}${
    isConnected ? " is-connected" : ""
  }`;

  return (
    <div className={fieldClass} css={styles}>
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
          className={`${Slugify(property.type.type)} ${classConnectable}${
            isCollectHandle ? " collect-handle" : ""
          }`}
        />
      </HandleTooltip>
    </div>
  );
};

export const HandleOnlyField = memo(HandleOnlyFieldImpl, isEqual);
HandleOnlyField.displayName = "HandleOnlyField";

export default HandleOnlyField;
