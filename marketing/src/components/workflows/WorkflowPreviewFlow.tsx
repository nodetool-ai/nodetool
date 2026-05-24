"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as Icons from "lucide-react";
import type { NodeHue, PreviewNode, PreviewEdge } from "@/lib/workflows/types";

// Port colors mirror the real NodeTool editor's data-type palette
const HUE_PORT: Record<NodeHue, string> = {
  sky: "#38bdf8",
  teal: "#2dd4bf",
  emerald: "#34d399",
  amber: "#f59e0b",
  rose: "#f43f5e",
  blue: "#60a5fa",
  violet: "#a78bfa",
  orange: "#fb923c",
};

const HUE_ICON: Record<NodeHue, string> = {
  sky: "text-sky-300",
  teal: "text-teal-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  blue: "text-blue-300",
  violet: "text-violet-300",
  orange: "text-orange-300",
};

type MarketplaceNodeData = {
  title: string;
  subtitle?: string;
  iconName: string;
  hue: NodeHue;
  badge?: string;
};

function MarketplaceNode({ data }: NodeProps<Node<MarketplaceNodeData>>) {
  const Icon =
    ((Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
      data.iconName
    ] as React.ComponentType<{ className?: string }> | undefined) ?? Icons.Box;
  const portColor = HUE_PORT[data.hue];
  return (
    <div
      className="relative rounded-md bg-[#262626] ring-1 ring-white/[0.06] shadow-lg shadow-black/60 w-[210px] hover:ring-white/15 transition-colors"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-t-md bg-[#2e2e2e] border-b border-black/40">
        <Icons.Quote className="h-3 w-3 text-neutral-500 shrink-0" aria-hidden />
        <div className="truncate text-[12px] font-normal text-neutral-300 flex-1">
          {data.title}
        </div>
      </div>

      {/* Body */}
      <div className="px-2.5 py-2 min-h-[58px] flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${HUE_ICON[data.hue]}`} />
        <div className="min-w-0 flex-1">
          {data.subtitle ? (
            <div className="truncate text-[11px] text-neutral-500 leading-tight">
              {data.subtitle}
            </div>
          ) : null}
          {data.badge ? (
            <div className="mt-1 inline-flex items-center rounded-sm bg-white/[0.04] px-1 py-[1px] text-[9px] font-medium uppercase tracking-wider text-neutral-400 ring-1 ring-white/[0.06]">
              {data.badge}
            </div>
          ) : null}
        </div>
      </div>

      {/* Resize bracket — bottom-right corner */}
      <svg
        className="pointer-events-none absolute bottom-1 right-1 text-neutral-600"
        width="8"
        height="8"
        viewBox="0 0 8 8"
        aria-hidden
      >
        <path d="M8 1 L8 8 L1 8" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>

      {/* Ports — colored rectangles flush to edges, colored by node hue */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 6,
          height: 12,
          borderRadius: 1,
          background: portColor,
          border: "none",
          left: -3,
          top: "65%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 6,
          height: 12,
          borderRadius: 1,
          background: portColor,
          border: "none",
          right: -3,
          top: "65%",
        }}
      />
    </div>
  );
}

const nodeTypes = { marketplace: MarketplaceNode };

interface WorkflowPreviewFlowProps {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  /** Pixel scale per grid unit (horizontal). */
  scaleX?: number;
  /** Pixel scale per grid unit (vertical). */
  scaleY?: number;
  /** Disable user pan/zoom (good for cards). */
  interactive?: boolean;
  className?: string;
}

function WorkflowPreviewFlowInner({
  nodes,
  edges,
  scaleX = 230,
  scaleY = 140,
  interactive = true,
  className,
}: WorkflowPreviewFlowProps) {
  const rfNodes: Node<MarketplaceNodeData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "marketplace",
        position: { x: n.x * scaleX, y: n.y * scaleY },
        data: {
          title: n.title,
          subtitle: n.subtitle,
          iconName: n.icon,
          hue: n.hue,
          badge: n.badge,
        },
        draggable: false,
        selectable: false,
      })),
    [nodes, scaleX, scaleY]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => ({
        id: `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        animated: e.animated ?? false,
        label: e.label,
        labelStyle: { fill: "#a3a3a3", fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" },
        labelBgStyle: { fill: "#171717", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "#d4a64a", strokeWidth: 1.5, opacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#d4a64a" },
      })),
    [edges]
  );

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#0a0a0a] ${className ?? ""}`}>
      <ReactFlow
        style={{ background: "#0a0a0a" }}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        panOnDrag={interactive}
        zoomOnDoubleClick={false}
        minZoom={0.3}
        maxZoom={1.6}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#262626" />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowPreviewFlow(props: WorkflowPreviewFlowProps) {
  return (
    <ReactFlowProvider>
      <WorkflowPreviewFlowInner {...props} />
    </ReactFlowProvider>
  );
}
