"use client";
/**
 * A workflow rendered for the web rather than for the editor.
 *
 * The previous renderer replicated the ReactFlow canvas: absolute editor
 * coordinates, handle rows, and a scale-to-fit transform. On a marketing page
 * a seven-node chain from that canvas shrinks to a fraction of its size and
 * the labels stop being readable. This renders the same graph as a sequence of
 * steps at full type size: topological layers become columns, parallel
 * branches stack inside a column, and the edges are drawn as measured curves
 * over the laid-out cards. The text stays legible and selectable, and the
 * layout reflows to a vertical stack on small screens.
 */
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Download,
  MoveRight,
  Braces,
  Box as BoxIcon,
} from "lucide-react";

import type { TemplateGraph, TemplateGraphNode } from "@/data/templates";
import { typeColor } from "./flow/tokens";

/**
 * Category for a node type, from its keywords. Most shipped graphs carry
 * `any`-typed edges, so the card accent comes from what a node *does* rather
 * than from the data type on its wire — otherwise every card is the same grey.
 */
const CATEGORIES = [
  { match: ["comment"], icon: MessageSquare, color: "#64748B" },
  { match: [".output.", "preview"], icon: Download, color: "#34D399" },
  { match: ["stringinput", "textinput", ".input."], icon: Type, color: "#FFA808" },
  { match: ["texttoimage", "image"], icon: ImageIcon, color: "#E838FF" },
  { match: ["video"], icon: Film, color: "#9460FF" },
  { match: ["audio", "speech", "tts"], icon: AudioLines, color: "#08B8FF" },
  { match: ["prompt", "formatter", "template"], icon: Wand2, color: "#F59E0B" },
  { match: ["agent", "generator", "llm", "chat"], icon: Sparkles, color: "#38BDF8" },
  { match: ["reroute", "control", "if", "loop"], icon: GitBranch, color: "#FBBF24" },
  { match: ["http", "fetch", "search", "browser"], icon: Globe, color: "#60A5FA" },
  { match: ["list", "collector", "dataframe"], icon: ListTree, color: "#FFD612" },
  { match: ["code", "python", "javascript"], icon: Braces, color: "#A78BFA" },
] as const;

function categoryFor(type: string) {
  const t = type.toLowerCase();
  return (
    CATEGORIES.find((c) => c.match.some((k) => t.includes(k))) ?? {
      icon: BoxIcon,
      color: "#7C8DA6",
    }
  );
}

/** "#E838FF" → "rgba(232,56,255,alpha)". Falls back to the input untouched. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** "nodetool.audio.TextToSpeech" → "audio". */
function namespaceOf(type: string): string {
  const parts = type.split(".");
  return parts.length > 2 ? parts[parts.length - 2] : parts[0];
}

type Step = TemplateGraphNode & {
  /** Named data types flowing out of this node (`any` carries no meaning). */
  outTypes: string[];
  /** Accent color, from the node's category or its output data type. */
  accent: string;
};

type Connector = {
  key: string;
  source: string;
  target: string;
  color: string;
};

type Measured = Connector & { d: string; x: number; y: number };

/**
 * Longest-path layering. A node sits one column right of its furthest
 * upstream node, so every edge points forward. Cycles (which the editor
 * allows through loop nodes) are cut by the visited set rather than hanging.
 */
function assignLayers(
  nodes: TemplateGraphNode[],
  edges: TemplateGraph["edges"],
): Map<string, number> {
  const preds = new Map<string, string[]>();
  for (const n of nodes) preds.set(n.id, []);
  for (const e of edges) {
    if (preds.has(e.target) && preds.has(e.source)) preds.get(e.target)!.push(e.source);
  }

  const layer = new Map<string, number>();
  const inProgress = new Set<string>();
  const depth = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (inProgress.has(id)) return 0;
    inProgress.add(id);
    const parents = preds.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map(depth)) + 1;
    inProgress.delete(id);
    layer.set(id, d);
    return d;
  };
  for (const n of nodes) depth(n.id);
  return layer;
}

function firstSeen(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildColumns(graph: TemplateGraph): { columns: Step[][]; notes: TemplateGraphNode[] } {
  const notes = graph.nodes.filter((n) => n.isComment && n.subtitle?.trim());
  const flowNodes = graph.nodes.filter((n) => !n.isComment);
  const ids = new Set(flowNodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const layer = assignLayers(flowNodes, edges);

  const steps: Step[] = flowNodes.map((n) => {
    const outTypes = firstSeen(
      edges
        .filter((e) => e.source === n.id)
        .map((e) => e.color)
        .filter((c) => c !== "any"),
    );
    const accent = outTypes[0]
      ? typeColor(outTypes[0])
      : categoryFor(n.type).color;
    return { ...n, outTypes, accent };
  });

  const maxLayer = Math.max(0, ...steps.map((s) => layer.get(s.id) ?? 0));
  const columns: Step[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const s of steps) columns[layer.get(s.id) ?? 0].push(s);
  // Keep the editor's vertical ordering inside a column so parallel branches
  // read in the same order the author arranged them.
  for (const col of columns) col.sort((a, b) => a.y - b.y);

  return { columns: columns.filter((c) => c.length > 0), notes };
}

/** A branch wider than this is summarized, so one fan-out cannot dominate. */
const COLUMN_LIMIT = 4;
/**
 * Past this many steps the cards drop their value previews. A long pipeline is
 * read for its shape, and full cards would make one tall branch set a height
 * the rest of the row cannot fill.
 */
const DENSE_ABOVE = 12;

export default function WorkflowFlowDiagram({
  graph,
  ariaLabel,
}: {
  graph: TemplateGraph;
  ariaLabel?: string;
}) {
  const { columns, notes } = useMemo(() => buildColumns(graph), [graph]);

  const connectors = useMemo<Connector[]>(() => {
    const accentById = new Map(
      columns.flat().map((s) => [s.id, s.accent] as const),
    );
    const seen = new Set<string>();
    const out: Connector[] = [];
    for (const e of graph.edges) {
      const key = `${e.source}->${e.target}:${e.color}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // An `any` wire says nothing about what flows through it, so the edge
      // takes the color of the step it leaves.
      const color =
        e.color === "any"
          ? (accentById.get(e.source) ?? typeColor("any"))
          : typeColor(e.color);
      out.push({ key, source: e.source, target: e.target, color });
    }
    return out;
  }, [graph.edges, columns]);

  const contentRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Measured[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [overflows, setOverflows] = useState(false);

  // One stable callback ref per node, so a re-render does not detach and
  // re-attach every card.
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const setCardRef = useCallback((id: string) => {
    const existing = refCallbacks.current.get(id);
    if (existing) return existing;
    const fn = (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(id, el);
      else cardRefs.current.delete(id);
    };
    refCallbacks.current.set(id, fn);
    return fn;
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      const base = content.getBoundingClientRect();
      const scroller = content.parentElement;
      setOverflows(!!scroller && scroller.scrollWidth > scroller.clientWidth + 8);
      setSize({ width: base.width, height: base.height });
      const next: Measured[] = [];
      for (const c of connectors) {
        const s = cardRefs.current.get(c.source);
        const t = cardRefs.current.get(c.target);
        if (!s || !t) continue;
        const a = s.getBoundingClientRect();
        const b = t.getBoundingClientRect();
        const horizontal = b.left >= a.right - 4;
        const from = horizontal
          ? { x: a.right - base.left, y: a.top + a.height / 2 - base.top }
          : { x: a.left + a.width / 2 - base.left, y: a.bottom - base.top };
        const to = horizontal
          ? { x: b.left - base.left, y: b.top + b.height / 2 - base.top }
          : { x: b.left + b.width / 2 - base.left, y: b.top - base.top };
        const bow = horizontal
          ? Math.max(24, (to.x - from.x) * 0.55)
          : Math.max(18, (to.y - from.y) * 0.55);
        const d = horizontal
          ? `M ${from.x} ${from.y} C ${from.x + bow} ${from.y}, ${to.x - bow} ${to.y}, ${to.x} ${to.y}`
          : `M ${from.x} ${from.y} C ${from.x} ${from.y + bow}, ${to.x} ${to.y - bow}, ${to.x} ${to.y}`;
        next.push({ ...c, d, x: to.x, y: to.y });
      }
      setPaths(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    for (const el of cardRefs.current.values()) ro.observe(el);
    // Web fonts land after first paint and change card heights.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [connectors, columns]);

  const dense = columns.reduce((n, c) => n + c.length, 0) > DENSE_ABOVE;

  if (columns.length === 0) return null;

  return (
    <div className="relative">
      <style>{FLOW_KEYFRAMES}</style>
      {/* A long chain scrolls rather than shrinking; the fade says so. */}
      {overflows && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-20 bg-gradient-to-l from-slate-950/95 via-slate-950/55 to-transparent md:block"
          />
          <span className="pointer-events-none absolute bottom-4 right-5 z-30 hidden items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-slate-400 md:inline-flex">
            Scroll to follow the flow
            <MoveRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </>
      )}
      <div className="overflow-x-auto pb-2 md:snap-x md:snap-proximity [scrollbar-color:theme(colors.slate.700)_transparent] [scrollbar-width:thin]">
        <div
          ref={contentRef}
          role="img"
          aria-label={ariaLabel}
          className="relative flex min-w-full flex-col gap-6 p-6 md:w-max md:flex-row md:items-start md:gap-12 md:p-8 md:pr-16"
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible"
            width={size.width || "100%"}
            height={size.height || "100%"}
          >
            {paths.map((p) => (
              <g key={p.key}>
                <path
                  d={p.d}
                  fill="none"
                  stroke={tint(p.color, 0.45)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <path
                  className="nt-flow-dash"
                  d={p.d}
                  fill="none"
                  stroke={tint(p.color, 0.9)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray="5 130"
                />
                <circle cx={p.x} cy={p.y} r={3} fill={tint(p.color, 0.85)} />
              </g>
            ))}
          </svg>

          {columns.map((col, i) => (
            <div
              key={i}
              className="relative z-10 flex flex-col gap-5 md:w-[232px] md:shrink-0 md:snap-start"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-slate-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
              </div>
              {col.slice(0, COLUMN_LIMIT).map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  dense={dense}
                  ref={setCardRef(step.id)}
                />
              ))}
              {col.length > COLUMN_LIMIT && (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-xs text-slate-500">
                  +{col.length - COLUMN_LIMIT} more{" "}
                  {col.length - COLUMN_LIMIT === 1 ? "node" : "nodes"} in this
                  step
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {notes.length > 0 && (
        <div className="grid gap-3 border-t border-white/5 px-6 py-5 sm:grid-cols-2 md:px-8">
          {notes.map((note) => (
            <p
              key={note.id}
              className="flex gap-2 text-xs leading-relaxed text-slate-400"
            >
              <MessageSquare
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600"
                aria-hidden
              />
              <span className="line-clamp-3">{note.subtitle}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const StepCard = React.forwardRef<
  HTMLElement,
  { step: Step; dense: boolean }
>(function StepCard({ step, dense }, ref) {
  const Icon = categoryFor(step.type).icon;
  return (
    <article
      ref={ref}
      className="group relative rounded-xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors duration-200 hover:border-white/25"
    >
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tint(step.accent, 0.5)}, transparent)`,
        }}
      />
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
          style={{
            borderColor: tint(step.accent, 0.35),
            background: tint(step.accent, 0.12),
            color: step.accent,
          }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-white">
            {step.title}
          </h3>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            {namespaceOf(step.type)}
          </p>
        </div>
      </div>

      {step.subtitle && !dense && (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-400">
          {step.subtitle}
        </p>
      )}

      {step.outTypes.length > 0 && !dense && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {step.outTypes.slice(0, 3).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: typeColor(t) }}
                aria-hidden
              />
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
});

const FLOW_KEYFRAMES = `
@keyframes nt-flow-dash { to { stroke-dashoffset: -135; } }
.nt-flow-dash { animation: nt-flow-dash 3.2s linear infinite; }
@media (prefers-reduced-motion: reduce) { .nt-flow-dash { display: none; } }
`;
