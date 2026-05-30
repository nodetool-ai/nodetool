/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { shallow } from "zustand/shallow";
import {
  Node,
  NodeProps,
  ResizeDragEvent,
  useStore,
  useReactFlow
} from "@xyflow/react";

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
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { Tooltip, ToolbarIconButton, Popover } from "../ui_primitives";

// constants
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const GROUP_BG_OPACITY = 0.35;
const GROUP_BORDER_OPACITY = 0.5;
const HEADER_HEIGHT = 32;
// Hex fallback used when group_color is unset or stored as a CSS var token
// (hexToRgba can't compute alpha on `var(--…)`, which produces invalid CSS).
const DEFAULT_GROUP_HEX = "#9ca3af";

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
      minHeight: minHeight + "px",
      width: "100%",
      height: "100%"
    },
    "&.hovered.control-pressed": {
      border: "2px dashed black !important"
    },
    height: "100%",
    display: "flex",
    borderRadius: "3px",
    // Header strip — transparent wrapper that holds the label and actions
    // and acts as a single hover hit region. Positioned just above the
    // group body so it never interferes with click-through to child nodes.
    ".group-header": {
      position: "absolute",
      left: 0,
      right: 0,
      pointerEvents: "auto",
      zIndex: 10
    },
    // Header label — flush at the top-left edge, not rounded, uses darkened group color.
    // Scales inversely with zoom so it appears the same size on screen.
    ".group-label": {
      position: "absolute",
      left: 0,
      height: `${HEADER_HEIGHT}px`,
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      borderRadius: "3px",
      color: theme.vars.palette.common.white,
      ".title-sizer": {
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "pre",
        pointerEvents: "none",
        fontFamily: theme.fontFamily1,
        fontSize: "var(--fontSizeNormal)",
        fontWeight: 400,
        letterSpacing: "0.02em"
      },
      transformOrigin: "bottom left",
      zIndex: 10,
      cursor: "move",
      userSelect: "none",
      pointerEvents: "auto",
      input: {
        boxSizing: "content-box",
        minWidth: "1ch",
        maxWidth: "unset",
        backgroundColor: "transparent",
        outline: "none",
        border: 0,
        padding: 0,
        margin: 0,
        color: "#ffffff",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
        fontFamily: theme.fontFamily1,
        fontSize: "var(--fontSizeNormal)",
        fontWeight: 400,
        letterSpacing: "0.02em",
        pointerEvents: "none",
        "&:focus": {
          pointerEvents: "all"
        }
      }
    },
    // Action buttons — flush at the top-right edge. Scaled inversely with zoom.
    ".group-actions": {
      position: "absolute",
      right: 0,
      height: `${HEADER_HEIGHT}px`,
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "0 6px",
      transformOrigin: "bottom right",
      zIndex: 10,
      pointerEvents: "auto",
      ".bypass-button, .menu-button": {
        border: "none !important",
        backgroundColor: "rgba(255, 255, 255, 0.10) !important",
        borderRadius: "var(--rounded-circle) !important",
        color: "rgba(255, 255, 255, 0.9) !important",
        width: "28px !important",
        height: "28px !important",
        padding: "0 !important",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.18) !important",
          color: "#ffffff !important"
        },
        "& svg": {
          fontSize: 20
        }
      },
      ".run-button": {
        width: "28px !important",
        height: "28px !important",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
        "& svg": {
          fontSize: "18px !important"
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
  const headerSizerRef = useRef<HTMLSpanElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [headlineTextWidth, setHeadlineTextWidth] = useState(0);
  const reactFlow = useReactFlow();
  const [groupBodyWidth, setGroupBodyWidth] = useState(() => {
    const n = reactFlow.getNode(props.id);
    return (n?.measured?.width ?? n?.width ?? MIN_WIDTH) as number;
  });
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) {return;}
    const update = (w: number) => {
      if (w > 0) {
        setGroupBodyWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
      }
    };
    update(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        update(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  // Local hover state for the header strip. A single transparent wrapper
  // div spans label + actions and serves as the hit region — cheap, no
  // global listeners, and unaffected by the body's pointer-events: none.
  const [headerHovered, setHeaderHovered] = useState(false);
  const onHeaderEnter = useCallback(() => setHeaderHovered(true), []);
  const onHeaderLeave = useCallback(() => setHeaderHovered(false), []);
  const store = useNodeStoreRef();

  // Soft inverse-zoom scaling so the header chrome stays a comfortable size
  // on screen at every zoom level. Strict 1/zoom (k=1) makes the label tiny
  // when zoomed in and absurd when zoomed out; using a sub-linear exponent
  // lets the label gently grow at high zoom and stay compact at low zoom.
  const zoom = useStore((s) => s.transform[2]);
  const clampedZoom = Math.min(Math.max(zoom, 0.08), 8);
  // Label needs to stay readable → grow a bit when zoomed in.
  const labelScale = Math.pow(1 / clampedZoom, 0.8);
  // Right-side action buttons don't need to read as text; scale them less so
  // they don't dominate the header (or overlap the label) when zoomed out.
  const actionsScale = Math.pow(1 / clampedZoom, 0.55);
  // World-space gap that renders as a constant ~5px on screen at any zoom.
  const screenGapPx = 5 / clampedZoom;

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
    let lastResult = {
      hasChildren: false,
      someChildrenBypassed: false,
      hasSelectedChild: false
    };
    return (state: ReturnType<typeof store.getState>) => {
      let hasChildren = false;
      let someChildrenBypassed = false;
      let hasSelectedChild = false;
      for (let i = 0; i < state.nodes.length; i++) {
        const node = state.nodes[i];
        if (node.parentId === props.id) {
          hasChildren = true;
          if (node.data.bypassed) {
            someChildrenBypassed = true;
          }
          if (node.selected) {
            hasSelectedChild = true;
          }
        }
        if (hasChildren && someChildrenBypassed && hasSelectedChild) {
          break;
        }
      }

      if (
        lastResult.hasChildren !== hasChildren ||
        lastResult.someChildrenBypassed !== someChildrenBypassed ||
        lastResult.hasSelectedChild !== hasSelectedChild
      ) {
        lastResult = { hasChildren, someChildrenBypassed, hasSelectedChild };
      }
      return lastResult;
    };
  }, [props.id]); // store is a stable ref that doesn't change
  const { hasChildren, someChildrenBypassed, hasSelectedChild } = useNodes(
    childrenStatusSelector
  );

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
    const groupNodeIds = new Set(groupNodes.map((n) => n.id));
    const groupEdges = edges.filter(
      (edge) =>
        groupNodeIds.has(edge.source) &&
        groupNodeIds.has(edge.target)
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

  const handleMenuToggle = useCallback(() => {
    setMenuOpen((v) => !v);
  }, []);
  const handleMenuClose = useCallback(() => {
    setMenuOpen(false);
  }, []);

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

  // Measure the rendered text width using a hidden sizer span so the input
  // is sized exactly to its content (the `ch` unit overshoots for
  // proportional fonts, leaving visible trailing padding). useLayoutEffect
  // updates the width synchronously after DOM mutation but before paint,
  // so the input never flashes at the previous frame's width while typing.
  useLayoutEffect(() => {
    if (headerSizerRef.current) {
      setHeadlineTextWidth(headerSizerRef.current.offsetWidth);
    }
  }, [headline]);

  // Only react to ctrl/meta when this group actually contains a selected
  // node — otherwise every group on the canvas would flip into the
  // "drag-out" mode (dimmed + pointer-receptive) whenever the modifier is
  // held for any reason.
  const modifierActive =
    (controlKeyPressed || metaKeyPressed) && hasSelectedChild;

  useEffect(() => {
    // Selectable group when ctrl/meta is held AND this group owns a
    // selected child — enables drag-out and selection rectangle inside.
    updateNode(props.id, { selectable: modifierActive });
  }, [updateNode, props.id, modifierActive]);

  // Bound the label to the group body width. Only reserve room for the
  // action cluster when it's actually visible — otherwise the label can use
  // the full group width.
  const actionsVisible = headerHovered || props.selected || menuOpen;
  const groupWorldWidth = groupBodyWidth;
  const actionsButtonCount = 2;
  const actionsBaseWidth =
    12 + actionsButtonCount * 28 + (actionsButtonCount - 1) * 6;
  const actionsWorldWidth = actionsBaseWidth * actionsScale;
  const reservedRightWorld = actionsVisible ? actionsWorldWidth + 8 : 0;
  const availableLabelWorldWidth = Math.max(
    0,
    groupWorldWidth - reservedRightWorld
  );
  const labelMaxCssWidth = Math.max(24, availableLabelWorldWidth / labelScale);

  const effectiveColor = resolveGroupHex(color);
  // Body tint: only a light touch of darkening before applying the overlay
  // alpha — heavy desaturation made pastels collapse to indistinguishable
  // grays once mixed with the dark canvas. Preserve the original hue/chroma
  // so picker colors still read as themselves on the group.
  const bodyTintHex = chroma(effectiveColor).desaturate(1.4).darken(0.3).hex();
  const bodyBg = hexToRgba(bodyTintHex, GROUP_BG_OPACITY);
  const subtleBorder = `1px solid ${hexToRgba(bodyTintHex, GROUP_BORDER_OPACITY)}`;
  // Label: same hue family as the body tint, with a small saturation +
  // brightness lift so the header reads as a subtle, related variant rather
  // than a contrasting pill.
  const labelBg = chroma(bodyTintHex).desaturate(0.4).brighten(0.25).hex();
  // Pick black or white text based on label background luminance so the title
  // stays legible whether the group color is dark or near-white.
  const labelTextColor = chroma(labelBg).luminance() > 0.55 ? "#000000" : "#ffffff";

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
          modifierActive ? 0.5 : nodeHovered ? 0.8 : 1,
        pointerEvents: modifierActive ? "all" : "none",
        backgroundColor: bodyBg
      }}
    >
      <div
        className="group-header"
        onPointerEnter={onHeaderEnter}
        onPointerLeave={onHeaderLeave}
        style={{
          bottom: `calc(100% + ${screenGapPx}px)`,
          height: `${HEADER_HEIGHT * Math.max(labelScale, actionsScale)}px`
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
            Double click the label
          </span>
        }
      >
        <div
          className="group-label node-drag-handle"
          onDoubleClick={handlePillDoubleClick}
          style={{
            backgroundColor: labelBg,
            color: labelTextColor,
            bottom: 0,
            transform: `scale(${labelScale})`,
            maxWidth: `${labelMaxCssWidth}px`,
            overflow: "hidden",
            transition: "max-width 0.15s ease"
          }}
        >
          <input
            ref={headerInputRef}
            spellCheck={false}
            className="nodrag"
            type="text"
            aria-label="Group headline"
            value={headline}
            onChange={handleHeadlineChange}
            placeholder="Group"
            style={{
              width: `${Math.max(headlineTextWidth + 2, 12)}px`,
              color: labelTextColor,
              maxWidth: "unset",
              textShadow: labelTextColor === "#000000" ? "none" : undefined
            }}
          />
          <span
            ref={headerSizerRef}
            aria-hidden
            className="title-sizer"
          >
            {headline || "Group"}
          </span>
        </div>
      </Tooltip>

      <div
        className="group-actions nodrag"
        style={{
          bottom: 0,
          transform: `scale(${actionsScale})`,
          opacity: headerHovered || props.selected || menuOpen ? 1 : 0,
          pointerEvents: headerHovered || props.selected || menuOpen ? "auto" : "none",
          transition: "opacity 0.15s ease"
        }}
      >
        <Tooltip title="Group options" delay={TOOLTIP_ENTER_DELAY}>
          <ToolbarIconButton
            ref={menuButtonRef}
            title=""
            size="small"
            tabIndex={-1}
            className="menu-button nodrag"
            onClick={handleMenuToggle}
          >
            <MoreVertIcon />
          </ToolbarIconButton>
        </Tooltip>
        <RunGroupButton
          isWorkflowRunning={isWorkflowRunning}
          state={state}
          onClick={runWorkflow}
        />
      </div>

      <Popover
        open={menuOpen}
        anchorEl={menuButtonRef.current}
        onClose={handleMenuClose}
        placement="bottom-right"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            padding: "12px"
          }}
        >
          {hasChildren && (
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
                {someChildrenBypassed ? "Enable all nodes" : "Bypass all nodes"}
              </span>
              <BypassGroupButton
                isBypassed={someChildrenBypassed}
                onClick={toggleBypassChildren}
              />
            </div>
          )}
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
      </div>

      {/* Help text — only shown on the group that currently has dragged
          nodes hovering over it, not every group on the canvas. */}
      <div className={`help-text ${nodeHovered ? "visible" : "none"}`}>
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
