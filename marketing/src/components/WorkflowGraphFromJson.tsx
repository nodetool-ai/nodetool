"use client";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Type,
  Image as ImageIcon,
  Film,
  AudioLines,
  Sparkles,
  Wand2,
  MessageSquare,
  GitBranch,
  Globe,
  ListTree,
  Box as BoxIcon,
} from "lucide-react";
import type { TemplateGraph, TemplateGraphNode } from "@/data/templates";
import { NodeCanvas, FlowNode, HandleRow, NodeText, FlowEdge } from "./flow";

// Layout constants — matched to FlowNode's rendered geometry so edge anchors
// line up with the real handle rows without any DOM measurement.
const HEADER_BLOCK = 34; // node padding(8) + header(24) + body margin(2)
const ROW = 26; // HandleRow minHeight(18) + marginBottom(8)
const ROW_CENTER = 9; // half of the 18px row
const BOTTOM_PAD = 10;
const SUBTITLE_BLOCK = 66; // reserved for a 3-line clamped preview
const COMMENT_BLOCK = 108; // reserved for a comment card's text
const PAD = 60; // canvas margin around the graph
const DEFAULT_MIN_HEIGHT = HEADER_BLOCK + BOTTOM_PAD;

type LaidOutNode = TemplateGraphNode & {
  inputs: string[];
  outputs: string[];
  height: number;
};

/** Pick an icon from the node type's category keywords. */
function iconFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("comment")) return MessageSquare;
  if (t.includes("stringinput") || t.includes("textinput") || t.includes(".input."))
    return Type;
  if (t.includes("texttoimage") || t.includes("image")) return ImageIcon;
  if (t.includes("video")) return Film;
  if (t.includes("audio") || t.includes("speech") || t.includes("tts"))
    return AudioLines;
  if (t.includes("prompt") || t.includes("formatter")) return Wand2;
  if (t.includes("agent") || t.includes("generator") || t.includes("llm"))
    return Sparkles;
  if (t.includes("reroute") || t.includes("control")) return GitBranch;
  if (t.includes("http") || t.includes("fetch") || t.includes("search"))
    return Globe;
  if (t.includes("list") || t.includes("collector")) return ListTree;
  return BoxIcon;
}

/** "PRIMARY_AUDIENCE" / "core_visual_concept" → "Primary Audience". */
function humanizeHandle(handle: string): string {
  const generic = new Set(["output", "input", "value", "item", "any"]);
  if (generic.has(handle.toLowerCase())) return "";
  return handle
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function firstSeen(handles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of handles) {
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

/**
 * Server-rendered workflow graph computed from a template's JSON: node
 * positions come from each node's editor position, handle rows are derived from
 * the edges, and edge anchors are computed from a fixed per-row stride so the
 * whole thing is deterministic across server and browser. Scaled to fit the
 * container width, like WorkflowGraph.tsx.
 */
export default function WorkflowGraphFromJson({
  graph,
  ariaLabel,
}: {
  graph: TemplateGraph;
  ariaLabel?: string;
}) {
  const { nodes, edges, width: W, height: H } = useMemo(() => layout(graph), [graph]);

  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setScale(Math.min(1, host.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [W]);

  const edgeWidth = Math.min(6, 2.4 / scale);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div ref={hostRef} style={{ width: "100%" }} role="img" aria-label={ariaLabel}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: H * scale,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          <NodeCanvas style={{ width: W, height: H }}>
            {edges.map((e, i) => {
              const s = byId.get(e.source);
              const t = byId.get(e.target);
              if (!s || !t) return null;
              const outIdx = s.outputs.indexOf(e.sourceHandle);
              const inIdx = t.inputs.indexOf(e.targetHandle);
              if (outIdx < 0 || inIdx < 0) return null;
              const from: [number, number] = [
                s.x + s.width,
                s.y + HEADER_BLOCK + (s.inputs.length + outIdx) * ROW + ROW_CENTER,
              ];
              const to: [number, number] = [
                t.x,
                t.y + HEADER_BLOCK + inIdx * ROW + ROW_CENTER,
              ];
              return (
                <FlowEdge key={i} from={from} to={to} color={e.color} width={edgeWidth} />
              );
            })}

            {nodes.map((n) => {
              const Icon = iconFor(n.type);
              return (
                <FlowNode
                  key={n.id}
                  title={n.isComment ? "Note" : n.title}
                  icon={<Icon size={16} />}
                  width={n.width}
                  minHeight={n.height}
                  style={{ left: n.x, top: n.y }}
                >
                  {n.inputs.map((h) => (
                    <HandleRow
                      key={`in-${h}`}
                      side="in"
                      color={colorForHandle(edges, n.id, h, "in")}
                      label={humanizeHandle(h) || undefined}
                    />
                  ))}
                  {n.outputs.map((h) => (
                    <HandleRow
                      key={`out-${h}`}
                      side="out"
                      color={colorForHandle(edges, n.id, h, "out")}
                      label={humanizeHandle(h) || undefined}
                    />
                  ))}
                  {n.subtitle && (
                    <div style={{ marginTop: n.isComment ? 0 : 4 }}>
                      <NodeText>
                        <span
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: n.isComment ? 5 : 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {n.subtitle}
                        </span>
                      </NodeText>
                    </div>
                  )}
                </FlowNode>
              );
            })}
          </NodeCanvas>
        </div>
      </div>
    </div>
  );
}

function colorForHandle(
  edges: TemplateGraph["edges"],
  nodeId: string,
  handle: string,
  side: "in" | "out",
): string {
  const edge =
    side === "in"
      ? edges.find((e) => e.target === nodeId && e.targetHandle === handle)
      : edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
  return edge?.color ?? "any";
}

function layout(graph: TemplateGraph): {
  nodes: LaidOutNode[];
  edges: TemplateGraph["edges"];
  width: number;
  height: number;
} {
  const inputsByNode = new Map<string, string[]>();
  const outputsByNode = new Map<string, string[]>();
  for (const e of graph.edges) {
    (inputsByNode.get(e.target) ?? inputsByNode.set(e.target, []).get(e.target)!).push(
      e.targetHandle,
    );
    (outputsByNode.get(e.source) ?? outputsByNode.set(e.source, []).get(e.source)!).push(
      e.sourceHandle,
    );
  }

  const nodes: LaidOutNode[] = graph.nodes.map((n) => {
    const inputs = n.isComment ? [] : firstSeen(inputsByNode.get(n.id) ?? []);
    const outputs = n.isComment ? [] : firstSeen(outputsByNode.get(n.id) ?? []);
    const subtitleBlock = n.subtitle
      ? n.isComment
        ? COMMENT_BLOCK
        : SUBTITLE_BLOCK
      : 0;
    const height = Math.max(
      DEFAULT_MIN_HEIGHT,
      HEADER_BLOCK + (inputs.length + outputs.length) * ROW + subtitleBlock + BOTTOM_PAD,
    );
    return { ...n, inputs, outputs, height };
  });

  if (nodes.length === 0) {
    return { nodes, edges: graph.edges, width: 800, height: 400 };
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  for (const n of nodes) {
    n.x = n.x - minX + PAD;
    n.y = n.y - minY + PAD;
  }
  const width = Math.max(...nodes.map((n) => n.x + n.width)) + PAD;
  const height = Math.max(...nodes.map((n) => n.y + n.height)) + PAD;

  return { nodes, edges: graph.edges, width, height };
}
