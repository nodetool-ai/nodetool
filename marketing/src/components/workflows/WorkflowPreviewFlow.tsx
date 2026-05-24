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

const HUE_RING: Record<NodeHue, string> = {
  sky: "from-sky-500/20 to-sky-500/0 ring-sky-400/30",
  teal: "from-teal-500/20 to-teal-500/0 ring-teal-400/30",
  emerald: "from-emerald-500/20 to-emerald-500/0 ring-emerald-400/30",
  amber: "from-amber-500/20 to-amber-500/0 ring-amber-400/30",
  rose: "from-rose-500/20 to-rose-500/0 ring-rose-400/30",
  blue: "from-blue-500/20 to-blue-500/0 ring-blue-400/30",
  violet: "from-violet-500/20 to-violet-500/0 ring-violet-400/30",
  orange: "from-orange-500/20 to-orange-500/0 ring-orange-400/30",
};

const HUE_DOT: Record<NodeHue, string> = {
  sky: "text-sky-300 bg-sky-500/10",
  teal: "text-teal-300 bg-teal-500/10",
  emerald: "text-emerald-300 bg-emerald-500/10",
  amber: "text-amber-300 bg-amber-500/10",
  rose: "text-rose-300 bg-rose-500/10",
  blue: "text-blue-300 bg-blue-500/10",
  violet: "text-violet-300 bg-violet-500/10",
  orange: "text-orange-300 bg-orange-500/10",
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
  return (
    <div
      className={`relative rounded-xl bg-slate-900/80 ring-1 backdrop-blur-md shadow-lg shadow-black/40 px-3 py-2.5 min-w-[170px] max-w-[200px] ring-white/10 hover:ring-white/30 transition-all`}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-60 ${HUE_RING[data.hue]}`}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 !border-slate-700"
      />
      <div className="relative flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${HUE_DOT[data.hue]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{data.title}</div>
          {data.subtitle ? (
            <div className="truncate text-[11px] text-slate-400">{data.subtitle}</div>
          ) : null}
        </div>
      </div>
      {data.badge ? (
        <div className="relative mt-2 inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300 ring-1 ring-white/10">
          {data.badge}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-400 !border-slate-700"
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
        labelStyle: { fill: "#94a3b8", fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" },
        labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: "#475569", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
      })),
    [edges]
  );

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
      <ReactFlow
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
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
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
