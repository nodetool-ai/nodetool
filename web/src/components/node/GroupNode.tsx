/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import ThemeNodes from "../themes/ThemeNodes";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";

// utils
import { getMousePosition } from "../../utils/MousePosition";

// store
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { debounce, isEqual } from "lodash";
import { hexToRgba } from "../../utils/ColorUtils";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import { PlayArrow } from "@mui/icons-material";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizer from "./NodeResizer";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import { useKeyPressed } from "../../stores/KeyPressedStore";
// constants
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

const styles = (theme: any, minWidth: number, minHeight: number) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: minWidth + "px",
      minHeight: minHeight + "px"
    },
    "&.hovered.control-pressed": {
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
      backgroundColor: "rgba(0,0,0,0.1)",
      width: "100%",
      margin: 0,
      padding: 0,
      border: 0,
      position: "absolute",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      ".title-input": {
        flexGrow: 1,
        padding: 0,
        margin: 0,
        overflow: "hidden"
      },
      input: {
        width: "100%",
        outline: "none",
        wordSpacing: "-.3em",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none",
        color: theme.palette.c_white,
        backgroundColor: "transparent",
        padding: ".5em 0.5em",
        border: 0,
        fontSize: "1.5em",
        fontWeight: 300
      }
    },
    // run stop button
    ".action-buttons": {
      marginRight: ".5em",
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      width: "auto",
      height: "2em",
      gap: ".5em"
    },
    ".action-buttons button": {
      padding: 0,
      margin: 0,
      minWidth: "unset",
      minHeight: "unset",
      color: "white",
      opacity: 0.6,
      transition: "all 0.2s ease"
    },
    ".action-buttons button:hover": {
      opacity: 1,
      background: "transparent"
    }
  });

const GroupNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const controlKeyPressed = useKeyPressed((state) =>
    state.isKeyPressed("control")
  );
  const nodeRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const { workflow, updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode,
    workflow: state.workflow
  }));
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const state = useWorkflowRunner((state) => state.state);
  const isWorkflowRunning = useWorkflowRunner(
    (state) => state.state === "running"
  );
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges
  }));
  const run = useWorkflowRunner((state) => state.run);
  const runWorkflow = useCallback(() => {
    // Filter nodes that belong to this group
    const groupNodes = nodes.filter(
      (node) => node.id === props.id || node.parentId === props.id
    );

    // Filter edges that connect nodes within this group
    const groupEdges = edges.filter(
      (edge) =>
        groupNodes.find((node) => node.id === edge.source) &&
        groupNodes.find((node) => node.id === edge.target)
    );

    run({}, workflow, groupNodes, groupEdges);
  }, [nodes, edges, run, workflow, props.id]);

  const nodeHovered = useNodes((state) =>
    state.hoveredNodes.includes(props.id)
  );

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

  // const handleOpenNodeMenu = useCallback(
  //   (e: React.MouseEvent) => {
  //     e.stopPropagation();
  //     e.preventDefault();
  //     openNodeMenu({
  //       x: getMousePosition().x,
  //       y: getMousePosition().y
  //     });
  //   },
  //   [openNodeMenu]
  // );

  // const handleDoubleClick = useCallback(
  //   (e: React.MouseEvent, id: string) => {
  //     e.preventDefault();
  //     e.stopPropagation();
  //     const clickedElement = e.target as HTMLElement;
  //     if (
  //       clickedElement.classList.contains("node-header") ||
  //       clickedElement.classList.contains("title-input")
  //     ) {
  //       // updateNodeData(id, { collapsed: !props.data.collapsed });
  //     } else {
  //       handleOpenNodeMenu(e);
  //     }
  //   },
  //   [handleOpenNodeMenu]
  // );

  // const handleHeaderClick = () => {
  //   updateNode(props.id, { selected: true });
  // };
  // const handleHeaderDoubleClick = (e: React.MouseEvent) => {
  //   headerInputRef.current?.focus();
  //   headerInputRef.current?.select();
  //   // e.preventDefault();
  //   // e.stopPropagation();
  //   // const clickedElement = e.target as HTMLElement;
  //   // if (clickedElement.classList.contains("node-header")) {
  //   //   updateNodeData(props.id, { collapsed: !props.data.collapsed });
  //   // }
  // };
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
    (newColor: string | null) => {
      setColor(newColor);
      updateNodeData(props.id, {
        properties: {
          group_color: newColor
        }
      });
    },
    [props.id, updateNodeData]
  );

  useEffect(() => {
    // Selectable group nodes when control key is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (controlKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, controlKeyPressed]);

  return (
    <div
      css={styles(ThemeNodes, MIN_WIDTH, MIN_HEIGHT)}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} 
      }`}
      // ${props.data.collapsed ? "collapsed" : ""
      // onDoubleClick={(e) => {
      //   handleDoubleClick(e, props.id);
      // }}
      style={{
        ...(nodeHovered
          ? { border: `2px solid ${ThemeNodes.palette.c_hl1}` }
          : {}),
        opacity: controlKeyPressed ? 0.5 : 1,
        // pointerEvents: controlKeyPressed ? "all" : ("none !important" as any),
        backgroundColor: hexToRgba(color || ThemeNodes.palette.c_bg_group, 0.2)
      }}
    >
      <div
        className="node-header"
        // onClick={handleHeaderClick}
        // onDoubleClick={handleHeaderDoubleClick}
      >
        <div className="title-input">
          <input
            ref={headerInputRef}
            spellCheck={false}
            className="nodrag"
            type="text"
            value={headline}
            onChange={handleHeadlineChange}
            placeholder=""
          />
        </div>
        <div className="action-buttons">
          <ColorPicker
            color={color || null}
            onColorChange={handleColorChange}
          />
          <Tooltip
            title={
              <div
                className="tooltip-span"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.1em"
                }}
              >
                <span style={{ fontSize: "1.2em", color: "white" }}>
                  Run Group
                </span>
                {/* <span style={{ fontSize: ".9em", color: "white" }}>
                  CTRL+Enter
                </span> */}
              </div>
            }
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              size="large"
              tabIndex={-1}
              className={`action-button run-stop-button run-workflow ${
                isWorkflowRunning ? "disabled" : ""
              }`}
              onClick={() => !isWorkflowRunning && runWorkflow()}
            >
              {state === "connecting" || state === "connected" ? (
                <>
                  <span
                    className={`run-status ${
                      state === "connecting" ? "connecting-status" : ""
                    }`}
                  >
                    {state === "connecting" ? "Connecting" : "Connected"}
                  </span>
                  <PlayArrow />
                </>
              ) : state === "running" ? (
                <CircularProgress />
              ) : (
                <PlayArrow />
              )}
            </Button>
          </Tooltip>
        </div>
      </div>

      <NodeResizeHandle
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        onResize={handleResize}
      />
      <NodeResizer minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />
    </div>
  );
};

export default memo(GroupNode, isEqual);
