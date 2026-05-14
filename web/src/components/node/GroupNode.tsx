/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import { Node, NodeProps, ResizeDragEvent } from "@xyflow/react";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

// store
import { NodeData } from "../../stores/NodeData";
import { debounce } from "../../utils/lodashAlternatives";
import isEqual from "fast-deep-equal";
import chroma from "chroma-js";
import { hexToRgba } from "../../utils/ColorUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import ColorPicker from "../inputs/ColorPicker";
import NodeResizer from "./NodeResizer";
import NodeResizeHandle from "./NodeResizeHandle";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useKeyPressed } from "../../stores/KeyPressedStore";
import RunGroupButton from "./RunGroupButton";
import BypassGroupButton from "./BypassGroupButton";
import { Tooltip, ToolbarIconButton, Popover } from "../ui_primitives";

// constants
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const GROUP_BG_OPACITY = 0.22;
const GROUP_BORDER_OPACITY = 0.45;
const PILL_HEIGHT = 40;
// Hex fallback used when group_color is unset or stored as a CSS var token
// (hexToRgba can't compute alpha on `var(--…)`, which produces invalid CSS).
const DEFAULT_GROUP_HEX = "#4a5563";

// Returns an opaque 6-digit hex. Catches three failure modes from saved data:
//   - missing / empty                  → default
//   - CSS-var string (e.g. "var(--…)") → default (chroma can't parse, hexToRgba
//                                        emits invalid rgb() with a hex inside)
//   - hex with built-in alpha (#RRGGBBAA) → strip alpha so solid backgrounds
//                                          (the pill) don't render translucent
const resolveGroupHex = (raw: string | null | undefined): string => {
  if (!raw || raw.trim().startsWith("var(")) {return DEFAULT_GROUP_HEX;}
  try {
    return chroma(raw).alpha(1).hex();
  } catch {
    return DEFAULT_GROUP_HEX;
  }
};

const styles = (theme: Theme, minWidth: number, minHeight: number) =>
  css({
    "&": {
      position: "relative",
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
    // pill — top-left, overlapping the bounding box
    ".group-pill": {
      position: "absolute",
      top: `-${PILL_HEIGHT / 2}px`,
      left: "12px",
      height: `${PILL_HEIGHT}px`,
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "0 6px 0 18px",
      borderRadius: `${PILL_HEIGHT / 2}px`,
      color: theme.vars.palette.common.white,
      boxShadow: [
        // inner top highlight (subtle "lift")
        "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        // inner bottom shadow for depth
        "inset 0 -1px 0 rgba(0, 0, 0, 0.25)",
        // outer drop shadow
        `0 3px 10px ${theme.vars.palette.grey[900]}80`
      ].join(", "),
      zIndex: 10,
      cursor: "move",
      userSelect: "none",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
      "&:hover": {
        boxShadow: [
          "inset 0 1px 0 rgba(255, 255, 255, 0.16)",
          "inset 0 -1px 0 rgba(0, 0, 0, 0.25)",
          `0 4px 14px ${theme.vars.palette.grey[900]}99`
        ].join(", ")
      },
      // Group body is pointer-events:none by default (click-through overlay);
      // the pill needs to opt back in so its buttons / title edit are clickable.
      pointerEvents: "auto",
      ".title-input": {
        display: "flex",
        alignItems: "center",
        minWidth: "40px",
        paddingRight: "8px"
      },
      input: {
        width: "fit-content",
        minWidth: "40px",
        maxWidth: "320px",
        backgroundColor: "transparent",
        outline: "none",
        border: 0,
        padding: 0,
        margin: 0,
        color: "#ffffff",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
        fontFamily: theme.fontFamily1,
        fontSize: "1.15em",
        fontWeight: 600,
        letterSpacing: "0.02em",
        pointerEvents: "none",
        "&:focus": {
          pointerEvents: "all"
        }
      },
      ".pill-actions": {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        paddingLeft: "6px",
        marginLeft: "2px",
        borderLeft: "1px solid rgba(255, 255, 255, 0.12)"
      },
      // Soften the BypassGroupButton inside the pill — its heavy
      // outlined-circle look fights with the pill aesthetic.
      ".pill-actions .bypass-button": {
        border: "none !important",
        backgroundColor: "transparent !important",
        color: "rgba(255, 255, 255, 0.85) !important",
        width: "32px !important",
        height: "32px !important",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.14) !important",
          color: "#ffffff !important"
        }
      },
      // Tone down the run button slightly so it sits within the pill,
      // not over it. Keep primary color for affordance.
      ".pill-actions .run-button": {
        width: "32px !important",
        height: "32px !important",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
        "& svg": {
          fontSize: "18px !important"
        }
      },
      ".overflow-button": {
        width: 32,
        height: 32,
        padding: 0,
        borderRadius: "var(--rounded-circle)",
        color: "rgba(255, 255, 255, 0.85)",
        backgroundColor: "transparent",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.14)",
          color: "#ffffff"
        },
        "& svg": {
          fontSize: 18
        }
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
      borderRadius: "var(--rounded-sm)",
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
  const cssStyles = useMemo(() => styles(theme, MIN_WIDTH, MIN_HEIGHT), [theme]);
  const controlKeyPressed = useKeyPressed((state) =>
    state.isKeyPressed("control")
  );
  const metaKeyPressed = useKeyPressed((state) => state.isKeyPressed("meta"));

  const nodeRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const overflowAnchorRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const store = useNodeStoreRef();

  const { updateNodeData, updateNode, setBypass } = useNodes(
    (state) => ({
      updateNodeData: state.updateNodeData,
      updateNode: state.updateNode,
      setBypass: state.setBypass
    }),
    shallow
  );

  // Optimization: Only subscribe to relevant booleans instead of full node/edge arrays
  // Combined into a single loop to halve O(N) operations during drag frames
  // Memoized to prevent returning a new object reference on every frame (which causes infinite re-renders)
  const childrenStatusSelector = useMemo(() => {
    let lastResult = { hasChildren: false, someChildrenBypassed: false };
    return (state: ReturnType<typeof store.getState>) => {
      let hasChildren = false;
      let someChildrenBypassed = false;
      for (let i = 0; i < state.nodes.length; i++) {
        const node = state.nodes[i];
        if (node.parentId === props.id) {
          hasChildren = true;
          if (node.data.bypassed) {
            someChildrenBypassed = true;
          }
        }
        if (hasChildren && someChildrenBypassed) {
          break;
        }
      }

      if (
        lastResult.hasChildren !== hasChildren ||
        lastResult.someChildrenBypassed !== someChildrenBypassed
      ) {
        lastResult = { hasChildren, someChildrenBypassed };
      }
      return lastResult;
    };
  }, [props.id]); // store is a stable ref that doesn't change
  const { hasChildren, someChildrenBypassed } = useNodes(childrenStatusSelector);

  // RUN WORKFLOW
  const state = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const run = useWebsocketRunner((state) => state.run);

  const runWorkflow = useCallback(() => {
    // Access state imperatively to avoid re-renders
    const state = store.getState();
    const { nodes, edges, workflow } = state;

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
  }, [run, props.id, store]);

  // Toggle bypass on all child nodes
  const toggleBypassChildren = useCallback(() => {
    const state = store.getState();
    const childNodes = state.nodes.filter((node) => node.parentId === props.id);

    // Check if some child nodes are bypassed (imperatively)
    const isBypassed = childNodes.some((n) => n.data.bypassed);
    const shouldBypass = !isBypassed;

    childNodes.forEach((node) => {
      setBypass(node.id, shouldBypass);
    });
  }, [props.id, setBypass, store]);

  const nodeHovered = useNodes((state) =>
    state.hoveredNodes.includes(props.id)
  );

  const isDragging = useNodes((state) => state.hoveredNodes.length > 0);

  const [headline, setHeadline] = useState(
    (props.data.properties.headline as string | undefined) || "Group"
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

  const handlePillDoubleClick = (_e: React.MouseEvent) => {
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
          group_color: newColor
        }
      });
    },
    [props.id, updateNodeData]
  );

  const handleOverflowToggle = useCallback(() => {
    setOverflowOpen((v) => !v);
  }, []);

  const handleOverflowClose = useCallback(() => {
    setOverflowOpen(false);
  }, []);

  useEffect(() => {
    // Selectable group nodes when control key is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (controlKeyPressed || metaKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [updateNode, props.id, controlKeyPressed, metaKeyPressed]);

  const effectiveColor = resolveGroupHex(color);
  const pillBg = effectiveColor;
  const bodyBg = hexToRgba(effectiveColor, GROUP_BG_OPACITY);
  const subtleBorder = `1px solid ${hexToRgba(effectiveColor, GROUP_BORDER_OPACITY)}`;

  return (
    <div
      css={cssStyles}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} ${props.selected ? "selected" : ""}`}
      style={{
        ...(props.selected
          ? {
              border: `2px solid ${theme.vars.palette.primary.main}`,
              boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}40, inset 0 0 20px ${theme.vars.palette.primary.main}10`
            }
          : nodeHovered
            ? { border: `2px solid ${theme.vars.palette.primary.main}` }
            : { border: subtleBorder }),
        opacity:
          controlKeyPressed || metaKeyPressed ? 0.5 : nodeHovered ? 0.8 : 1,
        pointerEvents: controlKeyPressed || metaKeyPressed ? "all" : "none",
        backgroundColor: bodyBg
      }}
    >
      <Tooltip
        placement="top"
        delay={TOOLTIP_ENTER_DELAY * 5}
        nextDelay={TOOLTIP_ENTER_DELAY * 5}
        title={
          <span>
            <b>SELECT GROUP NODE:</b> <br />
            Hold CTRL or ⌘ key + click <br />
            <br />
            <b>EDIT GROUP TITLE:</b> <br />
            Double click the pill
          </span>
        }
      >
        <div
          className="group-pill node-drag-handle"
          onDoubleClick={handlePillDoubleClick}
          style={{ backgroundColor: pillBg }}
        >
          <div className="title-input">
            <input
              ref={headerInputRef}
              spellCheck={false}
              className="nodrag"
              type="text"
              value={headline}
              onChange={handleHeadlineChange}
              placeholder="Group"
              size={Math.max(headline.length, 1)}
            />
          </div>
          <div className="pill-actions">
            {hasChildren && (
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
            <Tooltip title="More options" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                ref={overflowAnchorRef}
                title=""
                size="small"
                tabIndex={-1}
                className="overflow-button nodrag"
                onClick={handleOverflowToggle}
              >
                <MoreHorizIcon />
              </ToolbarIconButton>
            </Tooltip>
          </div>
        </div>
      </Tooltip>

      <Popover
        open={overflowOpen}
        anchorEl={overflowAnchorRef.current}
        onClose={handleOverflowClose}
        placement="bottom-right"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "10px 12px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}
          >
            <span
              style={{
                fontFamily: theme.fontFamily1,
                fontSize: theme.fontSizeSmall,
                color: theme.vars.palette.grey[200]
              }}
            >
              Group color
            </span>
            <ColorPicker
              buttonSize={24}
              color={color || null}
              onColorChange={handleColorChange}
            />
          </div>
        </div>
      </Popover>

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
