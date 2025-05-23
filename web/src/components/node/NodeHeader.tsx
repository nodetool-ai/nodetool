/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { MoreHoriz } from "@mui/icons-material";
import { memo, useCallback, useMemo } from "react";
import { isEqual } from "lodash";
import { titleizeString } from "../../utils/titleizeString";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";

export interface NodeHeaderProps {
  id: string;
  metadataTitle: string;
  hasParent?: boolean;
  parentColor?: string;
  showMenu?: boolean;
  data: NodeData;
  backgroundColor?: string;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  hasParent,
  parentColor,
  data,
  backgroundColor,
  showMenu = true
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  // const titleizedType = useMemo(
  //   () => (metadataTitle ? titleizeString(metadataTitle) : ""),
  //   [metadataTitle]
  // );
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

  const handleHeaderClick = useCallback(() => {
    updateNode(id, { selected: true });
  }, [id, updateNode]);

  return (
    <div
      className={`node-drag-handle node-header ${
        hasParent ? "has-parent" : ""
      }`}
      onClick={handleHeaderClick}
      style={{
        // borderTop: hasParent ? `1px solid ${parentColor}` : "none",
        backgroundColor: backgroundColor
      }}
    >
      {hasParent && (
        <span
          className="node-parent-color"
          style={{
            backgroundColor: parentColor,
            position: "absolute",
            width: "100%",
            height: "calc(100% - 24px)",
            pointerEvents: "none",
            opacity: 0.09,
            top: "24px",
            left: 0
          }}
        />
      )}
      <span className="node-title">{metadataTitle}</span>
      {showMenu && (
        <div className="menu-button-container" tabIndex={-1}>
          <button
            className="menu-button"
            tabIndex={-1}
            onClick={handleOpenContextMenu}
          >
            <MoreHoriz />
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(NodeHeader, isEqual);
