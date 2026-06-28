/**
 * DemoPlayer — renders the real NodeTool graph UI for a cast at a given time.
 *
 * This is the single rendering surface shared by both demo harnesses:
 *   - Remotion composition (direct embed): renders <DemoPlayer> inline and
 *     drives `timeMs` from the current frame, so Remotion's deterministic clock
 *     also drives the node UI's CSS animations (running rings, progress).
 *   - The standalone preview/record page (web/src/demo-entry): drives `timeMs`
 *     from a scrubber for authoring and capturing casts.
 *
 * It is self-contained: it brings its own theme, query client, and the same
 * provider stack the editor uses, and reuses the production BaseNode / Preview /
 * Output components so the graph looks exactly like the product.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  useNodesInitialized,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { useStore } from "zustand";

import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { MemoryRouter } from "react-router-dom";
import { TRPCProvider } from "../trpc/Provider";
import { queryClient } from "../queryClient";

// Global side-effect styles so the graph renders identically to the editor.
import "@xyflow/react/dist/style.css";
import "../styles/base.css";
import "../styles/nodes.css";
import "../styles/properties.css";
import "../styles/interactions.css";
import "../styles/special_nodes.css";
import "../styles/handle_edge_tooltip.css";

import ThemeNodetool from "../components/themes/ThemeNodetool";
import useMetadataStore from "../stores/MetadataStore";

// Real node + edge components (registered so the canvas matches production).
import BaseNode from "../components/node/BaseNode";
import GroupNode from "../components/node/GroupNode";
import CommentNode from "../components/node/CommentNode";
import PreviewNode from "../components/node/PreviewNode/PreviewNode";
import { OutputNode } from "../components/node/OutputNode";
import SketchNode, {
  SKETCH_NODE_TYPE,
} from "../components/node/SketchNode/SketchNode";
import PlaceholderNode from "../components/node_types/PlaceholderNode";
import CustomEdge from "../components/node_editor/CustomEdge";
import ControlEdge from "../components/node_editor/ControlEdge";
import {
  GROUP_NODE_TYPE,
  COMMENT_NODE_TYPE,
  PREVIEW_NODE_TYPE,
} from "../constants/nodeTypes";

import { NodeContext } from "../contexts/NodeContext";
import { WorkflowManagerProvider } from "../contexts/WorkflowManagerContext";
import { MenuProvider } from "../providers/MenuProvider";
import { ContextMenuProvider } from "../providers/ContextMenuProvider";

import type { NodeStore } from "../stores/NodeStore";
import type { DemoCast } from "./castTypes";
import { DemoEngine } from "./demoEngine";

const EDGE_TYPES: EdgeTypes = { default: CustomEdge, control: ControlEdge };

/** Build the node-type → component map exactly like the editor's canvas. */
function useDemoNodeTypes(): NodeTypes {
  const metadata = useMetadataStore((s) => s.metadata);
  return useMemo(() => {
    const map: NodeTypes = {};
    for (const nodeType of Object.keys(metadata)) {
      map[nodeType] = BaseNode as NodeTypes[string];
    }
    return {
      ...map,
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      [PREVIEW_NODE_TYPE]: PreviewNode,
      "nodetool.workflows.base_node.Output": OutputNode,
      "nodetool.output.Output": OutputNode,
      [SKETCH_NODE_TYPE]: SketchNode,
      default: PlaceholderNode,
    } as NodeTypes;
  }, [metadata]);
}

interface DemoCanvasProps {
  engine: DemoEngine;
  cast: DemoCast;
  timeMs: number;
  /** Controlled camera; when set, overrides cast.viewport / fitView so a host
   *  (e.g. a Remotion composition) can animate zoom/pan per frame. */
  viewport?: { x: number; y: number; zoom: number };
}

function DemoCanvas({ engine, cast, timeMs, viewport }: DemoCanvasProps): React.JSX.Element {
  const nodeTypes = useDemoNodeTypes();
  const nodes = useStore(engine.nodeStore, (s) => s.nodes);
  const edges = useStore(engine.nodeStore, (s) => s.edges);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const didFit = useRef(false);
  const controlled = viewport != null;
  const fixedViewport = viewport ?? cast.viewport;

  // Drive the replay synchronously before paint so each frame's DOM reflects
  // exactly the cast state at `timeMs`.
  useLayoutEffect(() => {
    engine.seekToTime(timeMs);
  }, [engine, timeMs]);

  // Fit the graph once when neither a controlled nor a recorded viewport is set.
  useEffect(() => {
    if (fixedViewport || didFit.current || nodes.length === 0) return;
    const timer = setTimeout(
      () => {
        fitView({ padding: 0.15 });
        didFit.current = true;
      },
      nodesInitialized ? 50 : 600
    );
    return () => clearTimeout(timer);
  }, [fixedViewport, fitView, nodes.length, nodesInitialized]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={EDGE_TYPES}
      // Controlled viewport (animated) takes precedence; otherwise fall back to
      // the cast's recorded camera, or fit the graph when neither is present.
      {...(controlled
        ? { viewport: fixedViewport }
        : { defaultViewport: cast.viewport ?? undefined, fitView: !cast.viewport })}
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.05}
      maxZoom={4}
      colorMode="dark"
      deleteKeyCode={null}
    >
      <Background
        gap={100}
        offset={4}
        size={8}
        color="rgba(255,255,255,0.04)"
        lineWidth={1}
        variant={BackgroundVariant.Cross}
      />
    </ReactFlow>
  );
}

export interface DemoPlayerProps {
  cast: DemoCast;
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  /** Maps a pinned asset file name to a host URL (Vite public, staticFile, …). */
  resolveAssetUrl: (file: string) => string;
  /** Canvas size; defaults to filling the parent. */
  style?: React.CSSProperties;
  /** Controlled camera; when set, overrides the cast's recorded viewport so a
   *  host can animate zoom/pan (e.g. a Remotion composition driving the clock). */
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * Self-contained demo surface. Create one per cast; `timeMs` may change every
 * frame. Memoizes the engine on `cast.id` so seeking is incremental.
 */
export function DemoPlayer({
  cast,
  timeMs,
  resolveAssetUrl,
  style,
  viewport,
}: DemoPlayerProps): React.JSX.Element {
  const resolveRef = useRef(resolveAssetUrl);
  resolveRef.current = resolveAssetUrl;

  const engine = useMemo(
    () => new DemoEngine(cast, { resolveAssetUrl: (f) => resolveRef.current(f) }),
    // Rebuild only when the cast identity changes.
    [cast.id]
  );

  useEffect(() => () => engine.dispose(), [engine]);

  return (
    // Some node components (e.g. ApiKeyValidation) call react-router hooks like
    // useNavigate; a MemoryRouter supplies the required Router context.
    <MemoryRouter>
      <TRPCProvider>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <InitColorSchemeScript attribute="class" defaultMode="dark" />
          <CssBaseline />
          <MenuProvider>
            <WorkflowManagerProvider queryClient={queryClient}>
              <ContextMenuProvider active={false}>
                <NodeContext.Provider value={engine.nodeStore as NodeStore}>
                  <ReactFlowProvider>
                    <div
                      data-demo-player
                      style={{ width: "100%", height: "100%", ...style }}
                    >
                      <DemoCanvas
                        engine={engine}
                        cast={cast}
                        timeMs={timeMs}
                        viewport={viewport}
                      />
                    </div>
                  </ReactFlowProvider>
                </NodeContext.Provider>
              </ContextMenuProvider>
            </WorkflowManagerProvider>
          </MenuProvider>
        </ThemeProvider>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default DemoPlayer;

/** Convenience: a player that owns its own clock, for non-Remotion previews. */
export function useDemoClock(durationMs: number, playing: boolean): number {
  const [timeMs, setTimeMs] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now() - timeMs;
    const tick = (now: number) => {
      const t = now - start;
      setTimeMs(t >= durationMs ? durationMs : t);
      if (t < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);
  return timeMs;
}
