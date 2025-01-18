/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { MoreHoriz } from "@mui/icons-material";
import { css } from "@emotion/react";
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
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

export const headerStyle = (theme: any, hasParent: boolean) =>
  css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 0,
    width: "100%",
    minHeight: "24px",
    backgroundColor: hasParent
      ? theme.palette.c_node_header_bg_group
      : theme.palette.c_node_header_bg,
    color: theme.palette.c_white,
    margin: 0,
    borderRadius: "0.3em 0.3em 0 0",
    "& svg.MuiSvgIcon-root": {
      scale: 0.8,
      opacity: 1
    },
    "&:hover": {
      transition: "opacity 0.15s",
      color: theme.palette.c_gray6
    },

    ".node-title": {
      display: "flex",
      flexDirection: "column",
      gap: 0,
      flexGrow: 1,
      textAlign: "left",
      maxWidth: 170,
      wordWrap: "break-word",
      lineHeight: "1em",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      fontFeatureSettings: '"smcp"',
      padding: ".5em 0 .5em .7em",

      "& .title-container": {
        position: "absolute",
        top: "-1.2em",
        left: ".5em",
        width: "100%",
        minHeight: "1em",
        backgroundColor: "transparent",
        display: "flex",
        flexDirection: "column",
        gap: 0
      },
      "& .title": {
        pointerEvents: "none",
        position: "absolute",
        bottom: "0",
        left: ".2em",
        width: "100%",
        color: theme.palette.c_white,
        fontSize: theme.fontSizeNormal,
        lineHeight: "1.1em",
        fontWeight: "300",
        fontStyle: "italic",
        margin: 0,
        padding: 0
      },
      "& .type": {
        pointerEvents: "none"
      }
    },
    ".big": {
      flex: 1,
      maxWidth: 180,
      wordWrap: "break-word",
      lineHeight: "1em",
      fontSize: 28
    },
    ".menu-button": {
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: "0.2em",
      marginRight: "0.2em",
      padding: 0,
      color: theme.palette.c_gray6,
      backgroundColor: "transparent",
      border: "none",
      cursor: "pointer",
      "&:hover": {
        color: theme.palette.c_white
      }
    },
    ".menu-button svg": {
      scale: "0.5"
    },
    ".color-picker-button": {
      position: "absolute",
      right: "0.5em",
      pointerEvents: "all",
      margin: "5px",
      height: "1.1em",
      zIndex: 10000,
      backgroundColor: "transparent",
      borderRadius: "0",
      "& svg": {
        color: theme.palette.c_gray5,
        width: ".5em",
        height: ".5em",
        rotate: "-86deg"
      },
      "&:hover svg": {
        color: theme.palette.c_hl1
      }
    }
  });

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

  const memoizedHeaderStyle = useMemo(
    () => headerStyle(ThemeNodes, hasParent || false),
    [hasParent]
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

  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const handleHeaderClick = useCallback(() => {
    updateNode(id, { selected: true });
  }, [updateNode, id]);

  return (
    <Tooltip
      title={description}
      placement="top"
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <div
        className="node-header"
        css={memoizedHeaderStyle}
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
          <div className="menu-button" tabIndex={-1}>
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
