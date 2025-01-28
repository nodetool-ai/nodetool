/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { MoreHoriz } from "@mui/icons-material";
import { css } from "@emotion/react";
import { useNodeStore } from "../../stores/NodeStore";
import { memo, useCallback, useMemo } from "react";
import ThemeNodes from "../themes/ThemeNodes";
import { isEqual } from "lodash";
import { titleizeString } from "../../utils/titleizeString";
import { NodeData } from "../../stores/NodeData";
import { Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface NodeHeaderProps {
  id: string;
  metadataTitle: string;
  description?: string;
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
  data,
  backgroundColor,
  description,
  showMenu = true
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const titleizedType = useMemo(
    () => (metadataTitle ? titleizeString(metadataTitle) : ""),
    [metadataTitle]
  );

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
    useNodeStore.getState().updateNode(id, { selected: true });
  }, [id]);

  return (
    <Tooltip
      title={description}
      placement="top"
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <div
        className={`node-drag-handle node-header ${
          hasParent ? "has-parent" : ""
        }`}
        onClick={handleHeaderClick}
        style={{
          backgroundColor: backgroundColor
        }}
      >
        {data.title && (
          <span className="node-title">
            <span className="title-container">
              <span className="title">{data.title}</span>
            </span>
            <span className="type">{titleizedType}</span>
          </span>
        )}
        {!data.title && <span className="node-title">{titleizedType}</span>}
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
    </Tooltip>
  );
};

export default memo(NodeHeader, isEqual);
