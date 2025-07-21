/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";

// store
import { NodeData } from "../../stores/NodeData";
import { debounce, isEqual } from "lodash";
import { hexToRgba } from "../../utils/ColorUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizer from "./NodeResizer";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import { useKeyPressed } from "../../stores/KeyPressedStore";
import RunGroupButton from "./RunGroupButton";
import { Tooltip } from "@mui/material";
// constants
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const GROUP_COLOR_OPACITY = 0.5;

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
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    backgroundColor: theme.vars.palette.c_bg_group,
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px",
      color: theme.vars.palette.grey[1000]
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
      color: theme.vars.palette.grey[1000],
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
        width: "fit-content",
        maxWidth: "100%",
        overflow: "hidden",
        backgroundColor: "transparent",
        outline: "none",
        wordSpacing: "-.3em",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none",
        color: theme.vars.palette.grey[0],
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
    },
    // help text
    ".help-text": {
      position: "absolute",
      top: "-80px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: hexToRgba(
        theme.vars.palette.grey[0],
        GROUP_COLOR_OPACITY
      ),
      color: "var(--palette-grey-1000)",
      padding: "0.75em 1em",
      borderRadius: "4px",
      fontSize: theme.fontSizeSmall,
      whiteSpace: "nowrap",
      zIndex: 100,
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      opacity: 0,
      visibility: "hidden",
      transition: "opacity 0.2s 2s ease, visibility 0.2s 2s ease"
    },
    ".help-text ul": {
      listStyleType: "square",
      padding: "0 0 0 .5em",
      margin: "0 0 0 1em"
    },
    ".help-text li": {
      padding: 0,
      margin: 0
    },
    ".help-text.visible": {
      opacity: 1,
      visibility: "visible"
    }
  });

const GroupNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const controlKeyPressed = useKeyPressed((state) =>
    state.isKeyPressed("control")
  );
  const metaKeyPressed = useKeyPressed((state) => state.isKeyPressed("meta"));

  const nodeRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const { workflow, updateNodeData, updateNode } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode,
    workflow: state.workflow
  }));
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges
  }));

  // const isSelected = useNodes((state) =>
  //   state.getSelectedNodeIds().includes(props.id)
  // );

  // RUN WORKFLOW
  const state = useWorkflowRunner((state) => state.state);
  const isWorkflowRunning = useWorkflowRunner(
    (state) => state.state === "running"
  );
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

  const isDragging = useNodes((state) => state.hoveredNodes.length > 0);

  const [headline, setHeadline] = useState(
    props.data.properties.headline || "Group"
  );

  const [color, setColor] = useState(
    props.data.properties.group_color || theme.vars.palette.c_bg_group
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
  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    headerInputRef.current?.focus();
    headerInputRef.current?.select();
    // e.preventDefault();
    // e.stopPropagation();
    // const clickedElement = e.target as HTMLElement;
    // if (clickedElement.classList.contains("node-header")) {
    //   updateNodeData(props.id, { collapsed: !props.data.collapsed });
    // }
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

  const handleHeaderClick = () => {
    // console.log("Node header clicked:", props.id, props.data);
  };

  useEffect(() => {
    // Selectable group nodes when control key is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (controlKeyPressed || metaKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, controlKeyPressed, metaKeyPressed]);

  return (
    <div
      css={styles(theme, MIN_WIDTH, MIN_HEIGHT)}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} 
      }`}
      style={{
        ...(nodeHovered
          ? { border: `2px solid ${theme.vars.palette.primary.main}` }
          : {}),
        opacity:
          controlKeyPressed || metaKeyPressed ? 0.5 : nodeHovered ? 0.8 : 1,
        pointerEvents: controlKeyPressed || metaKeyPressed ? "all" : "none",
        backgroundColor: hexToRgba(
          color || theme.vars.palette.c_bg_group,
          GROUP_COLOR_OPACITY
        )
      }}
    >
      <Tooltip
        placement="top"
        enterDelay={TOOLTIP_ENTER_DELAY * 5}
        enterNextDelay={TOOLTIP_ENTER_DELAY * 5}
        title={
          <span>
            <b>SELECT NODE:</b> Hold CTRL or ⌘ key + click
            <br />
            <b>EDIT TITLE:</b> Double click on header area
          </span>
        }
      >
        <div
          className="node-header node-drag-handle"
          onClick={handleHeaderClick}
          onDoubleClick={handleHeaderDoubleClick}
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
              buttonSize={20}
              color={color || null}
              onColorChange={handleColorChange}
            />
            <RunGroupButton
              isWorkflowRunning={isWorkflowRunning}
              state={state}
              onClick={runWorkflow}
            />
          </div>
        </div>
      </Tooltip>

      {/* Help text that appears when dragging nodes */}
      <div className={`help-text ${isDragging ? "visible" : "none"}`}>
        <div>
          <b>REMOVE FROM GROUP</b>
        </div>
        <ul>
          <li>Drag out while holding CTRL | ⌘ key</li>
          <li>Shake rapidly, then drag out</li>
        </ul>
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
