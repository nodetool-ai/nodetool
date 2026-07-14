"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import { Type, Wand2, Sparkles, List, Image as ImageIcon } from "lucide-react";
import {
  NodeCanvas,
  FlowNode,
  NodeProperty,
  NodeText,
  HandleRow,
  NodeChip,
  NodePreview,
  FlowEdge,
} from "./flow";

// Natural (unscaled) canvas size; the whole canvas scales to fit the container.
const W = 2520;
const H = 700;

// Deterministic edge routing — real handle anchors in canvas space, captured
// from the rendered nodes so edges draw identically in every browser.
const EDGES: Array<{ from: [number, number]; to: [number, number]; color: string }> = [
  { from: [321, 139], to: [467, 203], color: "string" }, // title → Strategy.Title
  { from: [321, 349], to: [467, 229], color: "string" }, // genre → Strategy.Genre
  { from: [321, 559], to: [467, 255], color: "string" }, // audience → Strategy.Audience
  { from: [911, 281], to: [980, 195], color: "string" }, // Strategy → Strategist
  { from: [1301, 237], to: [1360, 225], color: "string" }, // Strategist → Plots
  { from: [1681, 249], to: [1737, 231], color: "string" }, // Plots → Poster.Plot
  { from: [321, 139], to: [1737, 257], color: "string" }, // title → Poster.Title
  { from: [321, 349], to: [1737, 283], color: "string" }, // genre → Poster.Genre
  { from: [2061, 309], to: [2160, 341], color: "string" }, // Poster → Render
];

export default function MoviePosterGraph() {
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
  }, []);

  const edgeWidth = Math.min(6, 2.4 / scale);

  return (
    <div ref={hostRef} style={{ width: "100%" }}>
      <div style={{ position: "relative", width: "100%", height: H * scale, overflow: "hidden" }}>
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
            {EDGES.map((e, i) => (
              <FlowEdge key={i} from={e.from} to={e.to} color={e.color} width={edgeWidth} />
            ))}

            <div data-node="title" style={{ position: "absolute", left: 40, top: 40 }}>
              <FlowNode title="Movie Title" icon={<Type size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value">Singularity</NodeProperty>
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="genre" style={{ position: "absolute", left: 40, top: 250 }}>
              <FlowNode title="Genre" icon={<Type size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value">Sci-Fi</NodeProperty>
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="audience" style={{ position: "absolute", left: 40, top: 460 }}>
              <FlowNode title="Primary Audience" icon={<Type size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value">AI Enthusiasts</NodeProperty>
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="strategy" style={{ position: "absolute", left: 470, top: 60 }}>
              <FlowNode title="Prompt" icon={<Wand2 size={16} />} width={440} style={{ position: "relative" }}>
                <NodeText>
                  {`You are a senior movie-poster strategist. Write positioning, audience insight, core visual concept, and a color palette for a fictional film.`}
                </NodeText>
                <div style={{ padding: "0 8px", marginBottom: 8 }}>
                  <NodeChip>{`{{ TITLE }}`}</NodeChip>
                  <NodeChip>{`{{ GENRE }}`}</NodeChip>
                  <NodeChip>{`{{ AUDIENCE }}`}</NodeChip>
                </div>
                <HandleRow side="in" color="string" label="Title" />
                <HandleRow side="in" color="string" label="Genre" />
                <HandleRow side="in" color="string" label="Audience" />
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="strategist" style={{ position: "absolute", left: 980, top: 120 }}>
              <FlowNode title="Strategy Agent" icon={<Sparkles size={16} />} width={320} control style={{ position: "relative" }}>
                <NodeProperty label="Returns" mono>
                  {`Positioning · Audience insight · Core visual concept · Color palette`}
                </NodeProperty>
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="plots" style={{ position: "absolute", left: 1360, top: 150 }}>
              <FlowNode title="List Generator" icon={<List size={16} />} width={320} style={{ position: "relative" }}>
                <NodeProperty label="Generates">Five distinct plot concepts from the strategy</NodeProperty>
                <HandleRow side="out" color="string" label="item" />
              </FlowNode>
            </div>

            <div data-node="poster" style={{ position: "absolute", left: 1740, top: 120 }}>
              <FlowNode title="Prompt" icon={<Wand2 size={16} />} width={320} style={{ position: "relative" }}>
                <NodeText>
                  {`Ultra-high-end theatrical key art. A striking central subject, dramatic lighting, premium typography, authentic billing block.`}
                </NodeText>
                <HandleRow side="in" color="string" label="Plot" />
                <HandleRow side="in" color="string" label="Title" />
                <HandleRow side="in" color="string" label="Genre" />
                <HandleRow side="out" color="string" />
              </FlowNode>
            </div>

            <div data-node="render" style={{ position: "absolute", left: 2160, top: 60 }}>
              <FlowNode title="Text To Image" icon={<ImageIcon size={16} />} width={340} style={{ position: "relative" }}>
                <NodePreview src="/poster-singularity-1.webp" ratio="2 / 3" />
                <HandleRow side="out" color="image" />
              </FlowNode>
            </div>
          </NodeCanvas>
        </div>
      </div>
    </div>
  );
}
