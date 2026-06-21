"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import { Type, Image as ImageIcon, Sparkles, Film, Wand2 } from "lucide-react";
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

// Natural (unscaled) canvas size. The graph is laid out in this coordinate
// space and the whole canvas is scaled to fit the container width.
const W = 1980;
const H = 990;

// Deterministic edge routing. Coordinates are the real handle anchors in canvas
// space (captured from the rendered nodes) so edges draw identically in every
// browser and on the server — no fragile post-mount DOM measurement.
const EDGES: Array<{ from: [number, number]; to: [number, number]; color: string }> = [
  { from: [321, 165], to: [467, 183], color: "string" }, // brief → Prompt.Brief
  { from: [321, 367], to: [467, 209], color: "string" }, // audience → Prompt.Audience
  { from: [321, 587], to: [467, 235], color: "string" }, // features → Prompt.Features
  { from: [957, 261], to: [1020, 363], color: "string" }, // Prompt → Agent
  { from: [321, 944], to: [1020, 411], color: "image" }, // Image → Agent
  { from: [1478, 453], to: [1545, 453], color: "string" }, // Agent → Image To Video
  { from: [321, 944], to: [1545, 505], color: "image" }, // Image → Image To Video
];

export default function WorkflowGraph() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setScale(Math.min(1, host.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Keep edges a constant ~2.4px on screen regardless of the canvas downscale.
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

            <FlowNode title="String Input" icon={<Type size={16} />} style={{ left: 40, top: 30 }}>
              <NodeProperty label="Value">
                Launch video for the Aurora Trail smart fitness watch,
                highlighting outdoor adventure tracking.
              </NodeProperty>
              <HandleRow side="out" color="string" />
            </FlowNode>

            <FlowNode title="String Input" icon={<Type size={16} />} style={{ left: 40, top: 250 }}>
              <NodeProperty label="Value">
                active millennials who enjoy weekend hiking and fitness
                challenges
              </NodeProperty>
              <HandleRow side="out" color="string" />
            </FlowNode>

            <FlowNode title="String Input" icon={<Type size={16} />} style={{ left: 40, top: 470 }}>
              <NodeProperty label="Value">
                GPS navigation, heart-rate analytics, adaptive coaching, water
                resistance
              </NodeProperty>
              <HandleRow side="out" color="string" />
            </FlowNode>

            <FlowNode title="Image Input" icon={<ImageIcon size={16} />} minHeight={200} style={{ left: 40, top: 690 }}>
              <NodePreview src="/smartwatch.png" ratio="4 / 3" />
              <HandleRow side="out" color="image" />
            </FlowNode>

            <FlowNode title="Prompt" icon={<Wand2 size={16} />} width={486} style={{ left: 470, top: 40 }}>
              <NodeText>
                {`Using the text and image inputs, write a video prompt for a single 16:9 product shot. Give clear instructions on the animations and movements in the video.`}
              </NodeText>
              <div style={{ padding: "0 8px", marginBottom: 8 }}>
                <NodeChip>{`{{ brief }}`}</NodeChip>
                <NodeChip>{`{{ audience }}`}</NodeChip>
                <NodeChip>{`{{ features }}`}</NodeChip>
              </div>
              <HandleRow side="in" color="string" label="Brief" />
              <HandleRow side="in" color="string" label="Audience" />
              <HandleRow side="in" color="string" label="Features" />
              <HandleRow side="out" color="string" />
            </FlowNode>

            <FlowNode title="Agent" icon={<Sparkles size={16} />} width={457} control style={{ left: 1020, top: 300 }}>
              <NodeProperty label="Prompt:" mono>
                {`Macro close-up, 50mm lens, low angle. A slow, smooth forward camera push on the Aurora Trail smartwatch resting on a wet, mossy river rock at dawn. Crisp water droplets bead and slide off the curved glass.`}
              </NodeProperty>
              <HandleRow side="out" color="string" />
            </FlowNode>

            <FlowNode title="Image To Video" icon={<Film size={16} />} width={400} minHeight={260} style={{ left: 1545, top: 330 }}>
              <NodePreview src="/product_video_example.mp4" video ratio="16 / 9" />
              <HandleRow side="out" color="video" />
            </FlowNode>
          </NodeCanvas>
        </div>
      </div>
    </div>
  );
}
