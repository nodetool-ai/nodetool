/** @jsxImportSource @emotion/react */
/**
 * E2E Workflow Test Runner app.
 *
 * Renders the real nodetool ReactFlow canvas for the workflow currently under
 * test, plus a sidebar listing every workflow in the suite with live status,
 * timing, output and error counts. Execution is driven by the Harness, which
 * records everything for the Playwright driver to harvest via `window.__E2E__`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge
} from "@xyflow/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ThemeNodetool from "../components/themes/ThemeNodetool";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";
import { NodeContext } from "../contexts/NodeContext";
import type { NodeStore } from "../stores/NodeStore";
import { ContextMenuProvider } from "../providers/ContextMenuProvider";
import { WorkflowManagerProvider } from "../contexts/WorkflowManagerContext";
import { MenuProvider } from "../providers/MenuProvider";
import PlaceholderNode from "../components/node_types/PlaceholderNode";
import GroupNode from "../components/node/GroupNode";
import CommentNode from "../components/node/CommentNode";
import { GROUP_NODE_TYPE, COMMENT_NODE_TYPE } from "../constants/nodeTypes";
import CustomEdge from "../components/node_editor/CustomEdge";
import ControlEdge from "../components/node_editor/ControlEdge";

import { Harness, type HarnessState } from "./harness";
import { buildRenderGraph, type RenderGraph } from "./graphRender";
import type { RunRecord, RunStatus } from "./types";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, enabled: false } }
});

const edgeTypes = { default: CustomEdge, control: ControlEdge };

const STATUS_COLOR: Record<string, string> = {
  pending: "#64748B",
  running: "#3B82F6",
  completed: "#22C55E",
  failed: "#EF4444",
  error: "#EF4444",
  cancelled: "#F59E0B",
  timeout: "#F59E0B",
  skipped: "#94A3B8"
};

function StatusDot({ status }: { status: RunStatus | string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: "50%",
        marginRight: 8,
        background: STATUS_COLOR[status] ?? "#64748B",
        boxShadow:
          status === "running" ? `0 0 6px ${STATUS_COLOR.running}` : "none"
      }}
    />
  );
}

function Sidebar({
  state,
  manual,
  onRunAll,
  onRunNext
}: {
  state: HarnessState;
  manual: boolean;
  onRunAll: () => void;
  onRunNext: () => void;
}) {
  const done = state.records.filter((r) => r.status !== "pending" && r.status !== "running");
  const passed = state.records.filter(
    (r) => r.status === "completed" && r.expectationFailures.length === 0
  ).length;
  const failed = done.length - passed - done.filter((r) => r.status === "skipped").length;
  const skipped = done.filter((r) => r.status === "skipped").length;

  return (
    <div
      style={{
        width: 340,
        height: "100vh",
        overflowY: "auto",
        background: "#0B1120",
        borderRight: "1px solid #1E293B",
        color: "#E2E8F0",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13
      }}
    >
      <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid #1E293B" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>E2E Workflow Runner</div>
        <div style={{ marginTop: 6, color: "#94A3B8" }}>
          {passed} passed · {failed} failed · {skipped} skipped /{" "}
          {state.records.length} total
        </div>
        {manual && (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={onRunNext} style={btnStyle}>
              Run next
            </button>
            <button onClick={onRunAll} style={btnStyle}>
              Run all
            </button>
          </div>
        )}
      </div>
      {state.records.map((rec, i) => (
        <div
          key={rec.id}
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #141d2e",
            background: i === state.currentIndex ? "#13203b" : "transparent"
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <StatusDot status={rec.status} />
            <span style={{ fontWeight: 500 }}>{rec.name}</span>
          </div>
          <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 11 }}>
            {rec.status}
            {rec.durationMs != null ? ` · ${rec.durationMs}ms` : ""}
            {rec.counts.outputs ? ` · ${rec.counts.outputs} out` : ""}
            {rec.counts.errors ? ` · ${rec.counts.errors} err` : ""}
            {rec.skipReason ? ` · ${rec.skipReason}` : ""}
          </div>
          {rec.expectationFailures.length > 0 && (
            <div style={{ marginTop: 4, color: "#EF4444", fontSize: 11 }}>
              {rec.expectationFailures.join("; ")}
            </div>
          )}
          {rec.error && (
            <div style={{ marginTop: 4, color: "#F87171", fontSize: 11 }}>
              {rec.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#1D4ED8",
  color: "white",
  border: "none",
  borderRadius: 4,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 12
};

function CanvasInner({
  graph,
  nodeStatus
}: {
  graph: RenderGraph;
  nodeStatus: Record<string, string>;
}) {
  const { fitView } = useReactFlow();
  const baseNodeTypes = useMetadataStore((s) => s.nodeTypes);
  const nodeTypes = useMemo(
    () => ({
      ...baseNodeTypes,
      [GROUP_NODE_TYPE]: GroupNode,
      [COMMENT_NODE_TYPE]: CommentNode,
      default: PlaceholderNode
    }),
    [baseNodeTypes]
  );

  const nodes = useMemo<Node<NodeData>[]>(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        className: `e2e-node e2e-node-${nodeStatus[n.id] ?? "idle"}`
      })),
    [graph.nodes, nodeStatus]
  );

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15 }), 250);
    return () => clearTimeout(t);
  }, [graph, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={graph.edges as Edge[]}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
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

function Canvas({
  harness,
  state
}: {
  harness: Harness;
  state: HarnessState;
}) {
  const [graph, setGraph] = useState<RenderGraph | null>(null);
  const idx = state.currentIndex;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await harness.currentGraph();
      if (!current || cancelled) return;
      const built = await buildRenderGraph(current.graph);
      if (!cancelled) setGraph(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [harness, idx]);

  if (!graph) {
    return (
      <div style={centeredStyle}>
        {idx < 0 ? "Waiting to start…" : "Building graph…"}
      </div>
    );
  }

  return (
    <NodeContext.Provider value={graph.store as unknown as NodeStore}>
      <ReactFlowProvider>
        <div style={{ width: "100%", height: "100vh" }}>
          <CanvasInner graph={graph} nodeStatus={state.nodeStatus} />
        </div>
      </ReactFlowProvider>
    </NodeContext.Provider>
  );
}

const centeredStyle: React.CSSProperties = {
  width: "100%",
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#64748B",
  fontFamily: "system-ui, sans-serif"
};

export default function E2ERunnerApp() {
  const harnessRef = useRef<Harness | null>(null);
  if (!harnessRef.current) harnessRef.current = new Harness();
  const harness = harnessRef.current;

  const [state, setState] = useState<HarnessState>(harness.getState());
  const [error, setError] = useState<string | null>(null);
  const manual = new URLSearchParams(window.location.search).has("manual");

  useEffect(() => {
    const unsubscribe = harness.subscribe(setState);
    (async () => {
      try {
        await harness.init();
        window.__E2E__ = harness.controller();
        if (!manual) {
          await harness.runAll();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      unsubscribe();
      harness.dispose();
    };
  }, [harness, manual]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <CssBaseline />
        <style>{`
          .e2e-node { transition: filter 120ms ease, opacity 120ms ease; }
          .e2e-node-running { filter: drop-shadow(0 0 8px ${STATUS_COLOR.running}); }
          .e2e-node-completed { filter: drop-shadow(0 0 6px ${STATUS_COLOR.completed}); }
          .e2e-node-failed, .e2e-node-error { filter: drop-shadow(0 0 6px ${STATUS_COLOR.failed}); }
          .e2e-node-idle { opacity: 0.85; }
        `}</style>
        <MenuProvider>
          <WorkflowManagerProvider queryClient={queryClient}>
            <ContextMenuProvider active={false}>
              <div
                data-e2e-state={state.state}
                style={{ display: "flex", width: "100vw", height: "100vh" }}
              >
                <Sidebar
                  state={state}
                  manual={manual}
                  onRunAll={() => void harness.runAll()}
                  onRunNext={() => void harness.runNext()}
                />
                <div style={{ flex: 1, position: "relative" }}>
                  {error ? (
                    <div style={{ ...centeredStyle, color: "#EF4444" }}>{error}</div>
                  ) : (
                    <Canvas harness={harness} state={state} />
                  )}
                </div>
              </div>
            </ContextMenuProvider>
          </WorkflowManagerProvider>
        </MenuProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Re-export so callers can find records easily in tests.
export type { RunRecord };
