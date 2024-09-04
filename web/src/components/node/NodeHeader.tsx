/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { ArrowDropDown } from "@mui/icons-material";
import { css, keyframes } from "@emotion/react";
import { useMetadata } from "../../serverState/useMetadata";
import { useNodeStore } from "../../stores/NodeStore";
import { useStore } from "reactflow";
import { memo, useCallback, useEffect, useMemo } from "react";
import ThemeNodes from "../themes/ThemeNodes";

export interface NodeHeaderProps {
  id: string;
  nodeTitle: string;
  isLoading?: boolean;
  hasParent?: boolean;
}

export const loadingEffect = keyframes`
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
`;

export const headerStyle = (theme: any, hasParent: boolean) =>
  css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    minHeight: "2em",
    background: hasParent
      ? theme.palette.c_node_header_bg_group
      : theme.palette.c_node_header_bg,
    color: theme.palette.c_white,
    margin: 0,
    borderRadius: "0.3em 0.3em 0 0",
    "& svg.MuiSvgIcon-root": {
      scale: 0.8,
      opacity: 1
    },
    "&.loading": {
      background: `linear-gradient(to left, ${theme.palette.c_gray1} 25%, ${theme.palette.c_gray2} 50%, ${theme.palette.c_gray3} 75%, ${theme.palette.c_gray1} 100%)`,
      backgroundSize: "200% 100%",
      animation: `${loadingEffect} 1s infinite linear`
    },
    "&:hover": {
      // opacity: 0.8,
      transition: "opacity 0.15s",
      color: theme.palette.c_gray6
    },
    ".node-title": {
      flexGrow: 1,
      textAlign: "left",
      maxWidth: 170,
      wordWrap: "break-word",
      lineHeight: "1em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontFeatureSettings: '"smcp"',
      margin: 0,
      padding: "0.5em 0.5em 0.5em 1em"
    },
    ".big": {
      flex: 1,
      maxWidth: 180,
      wordWrap: "break-word",
      lineHeight: "1em",
      fontSize: 28
    },
    ".menu-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: "0.2em",
      padding: 0,
      height: 15,
      color: theme.palette.c_gray5,
      backgroundColor: "transparent",
      border: "none",
      cursor: "pointer",
      "&:hover": {
        color: theme.palette.c_white
      }
    }
  });

export const NodeHeader = memo(({
  id,
  nodeTitle,
  isLoading,
  hasParent
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const { data } = useMetadata();
  const findNode = useNodeStore((state) => state.findNode);
  const currentZoom = useStore((state) => state.transform[2]);

  const node = useMemo(() => findNode(id), [findNode, id]);
  const metadata = useMemo(() => node?.type ? data?.metadataByType[node?.type] : null, [node, data]);
  const description = useMemo(() => metadata?.description.split("\n")[0] || "", [metadata]);

  useEffect(() => { }, [currentZoom]);

  const tooltipStyle = useMemo(() => css({
    '[role~="tooltip"][data-microtip-position|="top"]::after': {
      fontSize: currentZoom < 1.5 ? "1em" : ".7em",
      maxWidth: "250px",
      padding: "1em",
      textAlign: "left",
      transform: "translate3d(-90%, -5px, 0)"
    }
  }), [currentZoom]);

  const tooltipAttributes = useMemo(() => description
    ? {
      "aria-label": description,
      "data-microtip-position": "top",
      "data-microtip-size": "medium",
      role: "tooltip"
    }
    : {}, [description]);

  const memoizedHeaderStyle = useMemo(() => headerStyle(ThemeNodes, hasParent || false), [hasParent]);

  const handleOpenContextMenu = useCallback((
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    openContextMenu(
      "node-context-menu",
      id,
      event.clientX,
      event.clientY,
      "node-header"
    );
  }, [id, openContextMenu]);

  const headerClassName = useMemo(() => `node-header ${isLoading ? "loading" : ""}`, [isLoading]);

  return (
    <div
      className={headerClassName}
      css={memoizedHeaderStyle}
    >
      <span className="node-title">{nodeTitle}</span>
      <div className="menu-button" css={tooltipStyle}>
        <button
          className="menu-button"
          {...tooltipAttributes}
          onClick={handleOpenContextMenu}
        >
          <ArrowDropDown />
        </button>
      </div>
    </div>
  );
});

NodeHeader.displayName = 'NodeHeader';
