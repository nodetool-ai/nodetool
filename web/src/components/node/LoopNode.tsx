/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ThemeNodetool from "../themes/ThemeNodetool";

import { memo, useCallback, useEffect, useRef } from "react";
import {
  Node,
  NodeProps,
  NodeResizeControl,
  NodeResizer,
  ResizeDragEvent
} from "@xyflow/react";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import { Tooltip } from "@mui/material";
// components
import { NodeHeader } from "./NodeHeader";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
// utils
import { getMousePosition } from "../../utils/MousePosition";

// hooks
import { useMetadata } from "../../serverState/useMetadata";
// store
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
// constants
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "./BaseNode";
import { isEqual } from "lodash";

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
    backgroundColor: theme.palette.c_bg_loop,
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px"
    },
    // resize control
    ".tools .react-flow__resize-control.handle.bottom.right": {
      opacity: 1,
      right: "-8px",
      bottom: "-8px",
      margin: 0,
      borderRadius: "0 0 5px 0",
      width: "1.5em",
      height: "1.5em",
      background: "#222 !important"
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
    },
    // header
    ".node-header": {
      height: "3em",
      backgroundColor: "rgba(0,0,0,0.1)"
    },
    ".inputs": {
      // center child vertically
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      position: "absolute",
      top: "3.4em",
      left: "0"
    },
    ".input-label, .output-label": {
      position: "absolute",
      height: "1.75em",
      top: "0.6em",
      left: "0",
      padding: ".2em .75em",
      textAlign: "center",
      display: "block",
      backgroundColor: theme.palette.c_input,
      color: theme.palette.c_white,
      fontSize: theme.fontSizeSmall
    },
    ".output-label": {
      backgroundColor: theme.palette.c_output,
      position: "absolute",
      top: "4.2em",
      left: "unset",
      right: "0"
    },
    "& .react-flow__handle-right": {
      top: "4.5em"
      // bottom: "3em"
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
    }
  });

const LoopNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { data: metadata } = useMetadata();
  const nodeRef = useRef<HTMLDivElement>(null);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const { spaceKeyPressed } = useKeyPressedStore((state) => ({
    spaceKeyPressed: state.isKeyPressed(" ")
  }));
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const nodeHovered = useNodeStore((state) =>
    state.hoveredNodes.includes(props.id)
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

  useEffect(() => {
    /*
     * HACK: allow panning the canvas when clicking inside the node
     * Observe parent elements' classes and remove the "nopan" class
     */
    const removeNoPanClass = () => {
      if (nodeRef.current) {
        const parent = nodeRef.current.closest(".react-flow__node");
        if (parent && parent.classList.contains("nopan")) {
          parent.classList.remove("nopan");
        }
      }
    };
    removeNoPanClass();
    const observer = new MutationObserver(() => {
      removeNoPanClass();
    });
    if (nodeRef.current) {
      const parent = nodeRef.current.closest(".react-flow__node");
      if (parent) {
        observer.observe(parent, {
          attributes: true,
          attributeFilter: ["class"]
        });
      }
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // Selectable group nodes when spacekey is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (spaceKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, spaceKeyPressed]);

  if (!metadata) {
    return <div>Loading...</div>;
  }
  const nodeMetadata = metadata?.metadataByType[props.type];

  return (
    <div
      ref={nodeRef}
      className={`loop-node ${nodeHovered ? "hovered" : ""} ${
        spaceKeyPressed ? "space-pressed" : ""
      } ${props.data.collapsed ? "collapsed" : ""}`}
      onDoubleClick={(e) => {
        handleDoubleClick(e, props.id);
      }}
      css={styles}
      style={
        nodeHovered
          ? { border: `2px solid ${ThemeNodetool.palette.c_hl1}` }
          : {}
      }
    >
      <div className="inputs">
        <NodeInputs
          id={props.id}
          properties={nodeMetadata.properties}
          nodeType={props.type}
          data={props.data}
          onlyHandles={true}
        />
        <Tooltip
          title="Loop nodes expect a List or Dataframe of any type. Use the GroupInput node inside the loop to use those items one by one."
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        >
          <div className="input-label">Input</div>
        </Tooltip>
      </div>
      <NodeHeader id={props.id} nodeTitle={"Loop"} />
      {/* {nodeHovered && (
        <div className="info">Hold SPACE key to move nodes out of the loop</div>
      )} */}
      <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
      <Tooltip
        title="Returns the data of the GroupOutput outside the loop."
        placement="top"
        enterDelay={TOOLTIP_ENTER_DELAY}
        leaveDelay={TOOLTIP_LEAVE_DELAY}
        enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      >
        <div className="output-label">Output</div>
      </Tooltip>
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

export default memo(LoopNode, isEqual);
