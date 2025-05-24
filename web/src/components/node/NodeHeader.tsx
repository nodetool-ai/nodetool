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
  showMenu?: boolean;
  data: NodeData;
  backgroundColor?: string;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  hasParent,
  data,
  backgroundColor,
  showMenu = true
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const updateNode = useNodes((state) => state.updateNode);

  // const titleizedType = useMemo(
  //   () => (metadataTitle ? titleizeString(metadataTitle) : ""),
  //   [metadataTitle]
  // );

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
        backgroundColor: backgroundColor
      }}
    >
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
