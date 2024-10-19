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

// store
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { debounce, isEqual } from "lodash";
import { hexToRgba } from "../../utils/ColorUtils";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import { TOOLTIP_DELAY } from "../../config/constants";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import { PlayArrow } from "@mui/icons-material";
import ColorPicker from "../inputs/ColorPicker";

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
        // textShadow: "0 0 2px #2b2b2b",
        fontWeight: 300
      }
    },
    // run stop button
    ".workflow-actions": {
      padding: 0
    },
    ".workflow-actions button": {
      padding: 0,
      margin: 0,
      width: "1em",
      height: "2em",
      color: "white"
    },
    ".workflow-actions button:hover": {
      backgroundColor: "rgba(0,0,0,0.2)"
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
    },
    ".color-picker-button": {
      pointerEvents: "all",
      position: "absolute",
      bottom: "0",
      margin: "0",
      padding: "0",
      right: "1em",
      left: "unset",
      width: "0em",
      height: "1.1em",
      zIndex: 10000,
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "0",
      "& svg": {
        color: theme.palette.c_gray5,
        width: ".5em",
        height: ".5em",
        // scale: ".5",
        rotate: "-86deg"
      }
    }
  });

const GroupNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const isWorkflowRunning = useWorkflowRunner(
    (state) => state.state === "running"
  );
  const runWorkflow = useWorkflowRunner((state) => state.run);
  const state = useWorkflowRunner((state) => state.state);
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
      if (
        clickedElement.classList.contains("node-header") ||
        clickedElement.classList.contains("title-input")
      ) {
        updateNodeData(id, { collapsed: !props.data.collapsed });
      } else {
        handleOpenNodeMenu();
      }
    },
    [props.data.collapsed, updateNodeData, handleOpenNodeMenu]
  );

  const handleHeaderClick = () => {
    updateNode(props.id, { selected: true });
  };
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

  useEffect(() => {
    // Selectable group nodes when spacekey is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (spaceKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, spaceKeyPressed]);

  return (
    <div
      css={styles(ThemeNodes, MIN_WIDTH, MIN_HEIGHT)}
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
        <div className="workflow-actions">
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
            enterDelay={TOOLTIP_DELAY}
          >
            <Button
              size="large"
              className={`action-button run-stop-button run-workflow ${
                isWorkflowRunning ? "disabled" : ""
              }`}
              onClick={() => !isWorkflowRunning && runWorkflow({}, props.id)}
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
      <ColorPicker color={color} onColorChange={handleColorChange} />
      <div className="tools">
        <NodeResizeControl
          style={{ background: "transparent", border: "none" }}
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResize={handleResize}
        >
          <SouthEastIcon />
        </NodeResizeControl>
      </div>
      <div className="node-resizer">
        <NodeResizer minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />
      </div>
    </div>
  );
};

export default memo(GroupNode, isEqual);
