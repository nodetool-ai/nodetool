/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { memo, useCallback, useMemo } from "react";
import isEqual from "lodash/isEqual";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";

export interface NodeHeaderProps {
  id: string;
  metadataTitle: string;
  hasParent?: boolean;
  showMenu?: boolean;
  data: NodeData;
  backgroundColor?: string;
  selected?: boolean;
  iconType?: string;
  iconBaseColor?: string;
  showIcon?: boolean;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  hasParent,
  backgroundColor,
  selected,
  iconType,
  iconBaseColor,
  showIcon = true
}: NodeHeaderProps) => {
  const theme = useTheme();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const updateNode = useNodes((state) => state.updateNode);

  const handleOpenContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      openContextMenu(
        "node-context-menu",
        id,
        event.clientX,
        event.clientY,
        "node-header"
      );
    },
    [id, openContextMenu]
  );
  const handleHeaderContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        id,
        event.clientX,
        event.clientY,
        "node-header"
      );
    },
    [id, openContextMenu]
  );

  const handleHeaderClick = useCallback(() => {
    updateNode(id, { selected: true });
  }, [id, updateNode]);

  const hasIcon = Boolean(iconType);

  const headerStyle: React.CSSProperties | undefined = useMemo(() => {
    if (backgroundColor === "transparent") {
      return { background: "transparent" } as React.CSSProperties;
    }
    const tint = backgroundColor || "var(--c_node_header_bg)";
    return {
      background: selected
        ? (backgroundColor ? backgroundColor : hexToRgba(tint, 0.5))
        : `linear-gradient(90deg, ${hexToRgba(tint, 0.25)}, ${hexToRgba(
            tint,
            0.1
          )})`
    } as React.CSSProperties;
  }, [backgroundColor, selected]);

  return (
    <div
      className={`node-drag-handle node-header ${
        hasParent ? "has-parent" : ""
      }`}
      onClick={handleHeaderClick}
      onContextMenu={handleHeaderContextMenu}
      style={headerStyle || { backgroundColor }}
    >
      <div className="header-left">
        {hasIcon && showIcon && (
          <div
            className="node-icon"
            style={{
              background: iconBaseColor
                ? hexToRgba(iconBaseColor, 0.22)
                : "rgba(255,255,255,0.08)"
            }}
          >
            <IconForType
              iconName={iconType!}
              showTooltip={false}
              iconSize="small"
            />
          </div>
        )}
        <span
          className="node-title"
          style={{
            paddingLeft: hasIcon ? 0 : undefined
          }}
        >
          {metadataTitle}
        </span>
      </div>
    </div>
  );
};

export default memo(NodeHeader, isEqual);
