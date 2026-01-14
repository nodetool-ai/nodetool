/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";

// store
import { NodeData } from "../../stores/NodeData";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { hexToRgba } from "../../utils/ColorUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizer from "./NodeResizer";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import { useKeyPressed } from "../../stores/KeyPressedStore";
import RunGroupButton from "./RunGroupButton";
import BypassGroupButton from "./BypassGroupButton";
import { Tooltip, IconButton } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
// constants
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const GROUP_COLOR_OPACITY = 0.4;

const styles = (theme: Theme, minWidth: number, minHeight: number, isCollapsed: boolean) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: minWidth + "px",
      minHeight: isCollapsed ? "48px" : minHeight + "px",
      transition: "min-height 0.2s ease"
    },
    "&.hovered.control-pressed": {
      border: "2px dashed black !important"
    },
    "&.collapsed": {
      minHeight: "48px",
      height: "48px"
    },
    height: isCollapsed ? "48px" : "100%",
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
    ".collapsed-indicator": {
      position: "absolute",
      bottom: "8px",
      right: "8px",
      padding: "4px 8px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "4px",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[300]
    },
    ".collapsed-info": {
      padding: "4px 12px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "4px",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[300],
      marginLeft: "auto",
      marginRight: "8px"
    },
    ".child-nodes-container": {
      display: isCollapsed ? "none" : "block",
      width: "100%",
      height: "100%"
    },
    // header
    ".node-header": {
      backgroundColor: theme.vars.palette.action.hover,
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
    // action buttons container
    ".action-buttons": {
      marginRight: "0.5em",
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      width: "auto",
      height: "32px",
      gap: "6px",
      ".color-picker": {
        marginRight: "2px"
      }
    },
    // help text
    ".help-text": {
      position: "absolute",
      top: "-90px",
      left: "50%",
      transform: "translateX(-50%)",
      color: "var(--palette-grey-50)",
      backgroundColor: "var(--palette-grey-900)",
      boxShadow: `0 2px 8px ${theme.vars.palette.grey[900]}33`,
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      padding: "0.75em 1em",
      borderRadius: "4px",
      fontSize: theme.fontSizeSmall,
      whiteSpace: "nowrap",
      zIndex: 100,
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
  const { workflow, updateNodeData, updateNode, setBypass, toggleGroupCollapsed } = useNodes(
    (state) => ({
      updateNodeData: state.updateNodeData,
      updateNode: state.updateNode,
      workflow: state.workflow,
      setBypass: state.setBypass,
      toggleGroupCollapsed: state.toggleGroupCollapsed
    })
  );
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges
  }));

  // const isSelected = useNodes((state) =>
  //   state.getSelectedNodeIds().includes(props.id)
  // );

  // RUN WORKFLOW
  const state = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const run = useWebsocketRunner((state) => state.run);
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

  // Get child nodes of this group
  const childNodes = useMemo(() => {
    return nodes.filter((node) => node.parentId === props.id);
  }, [nodes, props.id]);

  // Check if some child nodes are bypassed (at least 1)
  const someChildrenBypassed = useMemo(() => {
    if (childNodes.length === 0) {
      return false;
    }
    const bypassedCount = childNodes.filter((n) => n.data.bypassed).length;
    return bypassedCount >= 1;
  }, [childNodes]);

  // Toggle bypass on all child nodes
  const toggleBypassChildren = useCallback(() => {
    const shouldBypass = !someChildrenBypassed;
    childNodes.forEach((node) => {
      setBypass(node.id, shouldBypass);
    });
  }, [childNodes, someChildrenBypassed, setBypass]);

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

  const isCollapsed = props.data.collapsed || false;
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
  const handleHeaderDoubleClick = (_e: React.MouseEvent) => {
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

  const handleToggleCollapse = useCallback(() => {
    toggleGroupCollapsed(props.id);
  }, [toggleGroupCollapsed, props.id]);

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
      css={styles(theme, MIN_WIDTH, MIN_HEIGHT, isCollapsed)}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} ${isCollapsed ? "collapsed" : ""}`}
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
            <b>SELECT GROUP NODE:</b> <br />
            Hold CTRL or ⌘ key + click <br />
            <br />
            <b>EDIT GROUP TITLE:</b> <br />
            Double click on header area <br />
            <br />
            <b>COLLAPSE/GROUP:</b> <br />
            Click arrow button in header
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
            <Tooltip title={isCollapsed ? "Expand group" : "Collapse group"}>
              <IconButton
                size="small"
                onClick={handleToggleCollapse}
                sx={{
                  color: theme.vars.palette.grey[400],
                  "&:hover": {
                    color: theme.vars.palette.grey[100],
                    bgcolor: theme.vars.palette.action.hover
                  }
                }}
              >
                {isCollapsed ? (
                  <KeyboardArrowUpIcon fontSize="small" />
                ) : (
                  <KeyboardArrowDownIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <ColorPicker
              buttonSize={24}
              color={color || null}
              onColorChange={handleColorChange}
            />
            {childNodes.length > 0 && (
              <BypassGroupButton
                isBypassed={someChildrenBypassed}
                onClick={toggleBypassChildren}
              />
            )}
            <RunGroupButton
              isWorkflowRunning={isWorkflowRunning}
              state={state}
              onClick={runWorkflow}
            />
          </div>
        </div>
      </Tooltip>

      {isCollapsed && (
        <div className="collapsed-info">
          {childNodes.length} node{childNodes.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Help text that appears when dragging nodes */}
      <div className={`help-text ${isDragging ? "visible" : "none"}`}>
        <div>
          <b>REMOVE NODES FROM GROUP</b>
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
