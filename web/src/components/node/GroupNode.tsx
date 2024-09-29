/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ThemeNodes from "../themes/ThemeNodes";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Node,
  NodeProps,
  NodeResizeControl,
  NodeResizer,
  ResizeDragEvent
} from "@xyflow/react";
import SouthEastIcon from "@mui/icons-material/SouthEast";

// utils
import { getMousePosition } from "../../utils/MousePosition";

// hooks
import { useMetadata } from "../../serverState/useMetadata";

// store
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { debounce } from "lodash";
import { NodeColorSelector } from "./NodeColorSelector";
import { hexToRgba } from "../../utils/ColorUtils";

const styles = (theme: any) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: "400px",
      minHeight: "250px"
    },
    "&.hovered.space-pressed": {
      border: "2px dashed black !important"
    },
    height: "100%",
    display: "flex",
    borderRadius: "5px",
    border: `1px solid ${theme.palette.c_gray2}`,
    backgroundColor: theme.palette.c_bg_group,
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px",
      color: theme.palette.c_black
    },
    ".info": {
      position: "absolute",
      top: ".5em",
      right: "0",
      left: "0",
      width: "100%",
      textAlign: "center",
      padding: ".5em",
      backgroundColor: "transparent",
      color: theme.palette.c_black,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    },
    // header
    ".node-header": {
      height: "3em",
      backgroundColor: "rgba(0,0,0,0.1)",
      width: "100%",
      minHeight: "unset",
      margin: 0,
      padding: "0 0.5em",
      left: "0px",
      border: 0,
      position: "absolute",
      top: 0,
      display: "flex",
      alignItems: "center",
      input: {
        outline: "none",
        wordSpacing: "-.3em",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none",
        width: "90%",
        color: theme.palette.c_white,
        backgroundColor: "transparent",
        border: 0,
        padding: ".1em 0 0 .1em",
        fontSize: theme.fontSizeGiant,
        textShadow: "0 0 2px #2b2b2b",
        fontWeight: 300
      }
    },

    // resizer

    ".tools .react-flow__resize-control.handle.bottom.right": {
      opacity: 1,
      right: "-8px",
      bottom: "-8px",
      margin: 0,
      borderRadius: "0 0 5px 0",
      width: "1.5em",
      height: "1.5em",
      backgroundColor: theme.palette.c_gray2,
      pointerEvents: "all",
      "&:hover": {
        backgroundColor: theme.palette.c_gray3
      }
    },
    ".tools .react-flow__resize-control.handle:hover": {
      backgroundColor: theme.palette.c_gray3
    },
    ".node-resizer .react-flow__resize-control.handle": {
      opacity: 0
    },
    ".node-resizer .react-flow__resize-control.line": {
      opacity: 0,
      borderWidth: "1px",
      borderColor: theme.palette.c_gray2,
      transition: "all 0.15s ease-in-out"
    },
    ".node-resizer .react-flow__resize-control.line:hover": {
      opacity: 1
    }
  });

const GroupNode = (props: NodeProps<Node<NodeData>>) => {
  const { data: metadata } = useMetadata();
  const nodeRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const nodeHovered = useNodeStore((state) =>
    state.hoveredNodes.includes(props.id)
  );
  const { spaceKeyPressed } = useKeyPressedStore((state) => ({
    spaceKeyPressed: state.isKeyPressed(" ")
  }));

  const [headline, setHeadline] = useState(
    props.data.properties.headline || "Group"
  );

  const [color, setColor] = useState(
    props.data.properties.group_color || ThemeNodes.palette.c_bg_group
  );

  const handleResize = useCallback(
    (event: ResizeDragEvent) => {
      const newWidth = event.x;
      const newHeight = event.y;
      updateNodeData(props.id, {
        ...props.data,
        size: { width: newWidth, height: newHeight }
      });
    },
    [props.id, props.data, updateNodeData]
  );

  const handleOpenNodeMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      openNodeMenu(getMousePosition().x, getMousePosition().y, false, "", "");
    },
    [openNodeMenu]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("node-header")) {
        updateNodeData(id, { collapsed: !props.data.collapsed });
      } else {
        handleOpenNodeMenu();
      }
    },
    [props.data.collapsed, updateNodeData, handleOpenNodeMenu]
  );

  const handleHeaderClick = () => {
    headerInputRef.current?.focus();
    headerInputRef.current?.select();
  };

  const handleHeadlineChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newHeadline = event.target.value;
      setHeadline(newHeadline);
      debounce((newData) => {
        updateNodeData(props.id, {
          ...props.data,
          properties: {
            ...props.data.properties,
            ...newData
          }
        });
      }, 500)({
        headline: newHeadline
      });
    },
    [props.data, props.id, updateNodeData]
  );

  const handleColorChange = useCallback(
    (newColor: string) => {
      setColor(newColor);
      updateNodeData(props.id, {
        ...props.data,
        properties: {
          ...props.data.properties,
          group_color: newColor
        }
      });
    },
    [props.data, props.id, updateNodeData]
  );

  useEffect(() => {
    if (spaceKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, spaceKeyPressed]);

  if (!metadata) {
    return <div>Loading...</div>;
  }

  return (
    <div
      css={styles}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} ${
        spaceKeyPressed ? "space-pressed" : ""
      } ${props.data.collapsed ? "collapsed" : ""}`}
      onDoubleClick={(e) => {
        handleDoubleClick(e, props.id);
      }}
      style={{
        ...(nodeHovered
          ? { border: `2px solid ${ThemeNodes.palette.c_hl1}` }
          : {}),
        backgroundColor: hexToRgba(color || ThemeNodes.palette.c_bg_group, 0.2)
      }}
    >
      <div
        className="node-header"
        onClick={handleHeaderClick}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={headerInputRef}
          spellCheck={false}
          className="nodrag"
          type="text"
          value={headline}
          onChange={handleHeadlineChange}
          placeholder="Group"
        />
      </div>
      <NodeColorSelector onColorChange={handleColorChange} alwaysVisible />
      <div className="tools">
        <NodeResizeControl
          style={{ background: "transparent", border: "none" }}
          minWidth={400}
          minHeight={250}
          onResize={handleResize}
        >
          <SouthEastIcon />
        </NodeResizeControl>
      </div>
      <div className="node-resizer">
        <NodeResizer minWidth={400} minHeight={250} />
      </div>
    </div>
  );
};

export default memo(GroupNode);
