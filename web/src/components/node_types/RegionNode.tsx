/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { hexToRgba } from "../../utils/ColorUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizer from "../node/NodeResizer";
import NodeResizeHandle from "../node/NodeResizeHandle";
import { useNodes } from "../../contexts/NodeContext";
import { useKeyPressed } from "../../stores/KeyPressedStore";
import RunGroupButton from "../node/RunGroupButton";
import { Tooltip, Box, Chip } from "@mui/material";
import LoopIcon from "@mui/icons-material/Loop";
import CallSplitIcon from "@mui/icons-material/CallSplit";

// Constants
const MIN_WIDTH = 250;
const MIN_HEIGHT = 200;
const GROUP_COLOR_OPACITY = 0.3;

// Region types
export type RegionType = "foreach" | "if";

// Region-specific styles
const getRegionStyles = (
  theme: Theme,
  regionType: RegionType,
  minWidth: number,
  minHeight: number
) =>
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
    flexDirection: "column",
    borderRadius: "8px",
    border:
      regionType === "foreach"
        ? `2px dashed ${theme.vars.palette.primary.main}`
        : `2px dashed ${theme.vars.palette.secondary.main}`,
    backgroundColor: theme.vars.palette.c_bg_group,
    position: "relative",

    // Region header
    ".region-header": {
      backgroundColor:
        regionType === "foreach"
          ? hexToRgba(theme.vars.palette.primary.main, 0.15)
          : hexToRgba(theme.vars.palette.secondary.main, 0.15),
      width: "100%",
      margin: 0,
      padding: "8px 12px",
      borderBottom:
        regionType === "foreach"
          ? `1px dashed ${theme.vars.palette.primary.main}`
          : `1px dashed ${theme.vars.palette.secondary.main}`,
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      borderRadius: "6px 6px 0 0"
    },

    ".region-title": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      fontWeight: 600,
      fontSize: "0.9em"
    },

    ".region-icon": {
      fontSize: "1.2em",
      color:
        regionType === "foreach"
          ? theme.vars.palette.primary.main
          : theme.vars.palette.secondary.main
    },

    ".region-badge": {
      fontSize: "0.75em",
      height: "22px"
    },

    ".title-input": {
      flexGrow: 1,
      padding: 0,
      margin: 0,
      overflow: "hidden",
      input: {
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        backgroundColor: "transparent",
        outline: "none",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none",
        color: theme.vars.palette.text.primary,
        padding: "4px 8px",
        border: 0,
        fontSize: "1em",
        fontWeight: 500
      }
    },

    // Action buttons
    ".action-buttons": {
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "8px"
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

    ".action-buttons button.running": {
      opacity: 1,
      "&::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        padding: "2px",
        background: `conic-gradient(from 0deg, transparent 50%, ${theme.vars.palette.primary.main} 95%, ${theme.vars.palette.primary.main})`,
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "destination-out",
        maskComposite: "exclude",
        animation: "spin 2.5s linear infinite",
        pointerEvents: "none",
        zIndex: 1
      }
    },

    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "25%": { transform: "rotate(85deg)" },
      "50%": { transform: "rotate(180deg)" },
      "75%": { transform: "rotate(280deg)" },
      "100%": { transform: "rotate(360deg)" }
    },

    ".action-buttons button:hover": {
      opacity: 1,
      background: "transparent"
    },

    // Content area
    ".region-content": {
      flex: 1,
      padding: "8px",
      minHeight: "100px",
      position: "relative"
    },

    // Help text
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

interface RegionNodeProps extends NodeProps<Node<NodeData>> {
  regionType: RegionType;
}

const RegionNode: React.FC<RegionNodeProps> = ({ regionType, ...props }) => {
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

  // Workflow runner state
  const state = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const run = useWebsocketRunner((state) => state.run);

  const runWorkflow = useCallback(() => {
    // Filter nodes that belong to this region
    const regionNodes = nodes.filter(
      (node) => node.id === props.id || node.parentId === props.id
    );

    // Filter edges that connect nodes within this region
    const regionEdges = edges.filter(
      (edge) =>
        regionNodes.find((node) => node.id === edge.source) &&
        regionNodes.find((node) => node.id === edge.target)
    );

    run({}, workflow, regionNodes, regionEdges);
  }, [nodes, edges, run, workflow, props.id]);

  const nodeHovered = useNodes((state) =>
    state.hoveredNodes.includes(props.id)
  );

  const isDragging = useNodes((state) => state.hoveredNodes.length > 0);

  // Get default headline based on region type
  const defaultHeadline = regionType === "foreach" ? "ForEach" : "If";
  const [headline, setHeadline] = useState(
    props.data.properties.headline || defaultHeadline
  );

  const [color, setColor] = useState(
    props.data.properties.region_color || theme.vars.palette.c_bg_group
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

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
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
    (newColor: string | null) => {
      setColor(newColor);
      updateNodeData(props.id, {
        properties: {
          region_color: newColor
        }
      });
    },
    [props.id, updateNodeData]
  );

  const handleHeaderClick = () => {
    // Placeholder for header click behavior
  };

  useEffect(() => {
    // Selectable region nodes when control key is pressed
    if (controlKeyPressed || metaKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, controlKeyPressed, metaKeyPressed]);

  // Render iteration badge for ForEach regions
  const renderIterationBadge = () => {
    if (regionType !== "foreach") return null;

    // Access iteration data from properties
    const iterationCount = props.data.properties?.iteration_count as number | undefined;
    const currentIteration = props.data.properties?.current_iteration as number | undefined;
    if (iterationCount === undefined) return null;

    return (
      <Chip
        className="region-badge"
        label={
          currentIteration !== undefined
            ? `${currentIteration + 1}/${iterationCount}`
            : `0/${iterationCount}`
        }
        size="small"
        color="primary"
        variant="outlined"
      />
    );
  };

  // Render branch indicator for If regions
  const renderBranchIndicator = () => {
    if (regionType !== "if") return null;

    // Access branch data from properties
    const activeBranch = props.data.properties?.active_branch as "true" | "false" | null | undefined;

    return (
      <Box sx={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <Chip
          label="✓"
          size="small"
          color={activeBranch === "true" ? "success" : "default"}
          variant={activeBranch === "true" ? "filled" : "outlined"}
          sx={{ height: "20px", minWidth: "28px" }}
        />
        <Chip
          label="✗"
          size="small"
          color={activeBranch === "false" ? "error" : "default"}
          variant={activeBranch === "false" ? "filled" : "outlined"}
          sx={{ height: "20px", minWidth: "28px" }}
        />
      </Box>
    );
  };

  const RegionIcon = regionType === "foreach" ? LoopIcon : CallSplitIcon;

  return (
    <div
      css={getRegionStyles(theme, regionType, MIN_WIDTH, MIN_HEIGHT)}
      ref={nodeRef}
      className={`region-node ${regionType}-region ${nodeHovered ? "hovered" : ""} ${controlKeyPressed || metaKeyPressed ? "control-pressed" : ""}`}
      style={{
        ...(nodeHovered
          ? {
              border:
                regionType === "foreach"
                  ? `2px solid ${theme.vars.palette.primary.main}`
                  : `2px solid ${theme.vars.palette.secondary.main}`
            }
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
            <b>SELECT REGION NODE:</b> <br />
            Hold CTRL or ⌘ key + click <br />
            <br />
            <b>EDIT REGION TITLE:</b> <br />
            Double click on header area
            <br />
            <br />
            <b>ADD NODES:</b> <br />
            Drag nodes into this region
          </span>
        }
      >
        <div
          className="region-header node-drag-handle"
          onClick={handleHeaderClick}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div className="region-title">
            <RegionIcon className="region-icon" />
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
          </div>
          <div className="action-buttons">
            {renderIterationBadge()}
            {renderBranchIndicator()}
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

      <div className="region-content">
        {/* Nodes inside the region render here via React Flow's parent-child system */}
      </div>

      {/* Help text that appears when dragging nodes */}
      <div className={`help-text ${isDragging ? "visible" : "none"}`}>
        <div>
          <b>REMOVE NODES FROM REGION</b>
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

export default memo(RegionNode, isEqual);
