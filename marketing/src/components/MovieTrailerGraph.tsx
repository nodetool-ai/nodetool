"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Type,
  Hash,
  Clapperboard,
  List,
  Image as ImageIcon,
  Film,
} from "lucide-react";
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
const W = 2960;
const H = 760;

// Edges reference handle anchor ids. The real handle positions are measured from
// the rendered DOM (offset chain — immune to the CSS scale), so the connectors
// always land on the ports regardless of how the text reflows the node heights.
const EDGES: Array<{ from: string; to: string; color: string }> = [
  { from: "logline.out", to: "director.brief", color: "string" },
  { from: "style.out", to: "director.style", color: "string" },
  { from: "count.out", to: "director.count", color: "int" },
  { from: "director.out", to: "shots.screenplay", color: "dict" },
  { from: "shots.prompt", to: "keyframe.shot", color: "string" },
  { from: "keyframe.out", to: "i2v.image", color: "image" },
  { from: "i2v.out", to: "concat.video", color: "video" },
];

export default function MovieTrailerGraph() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [anchors, setAnchors] = useState<Record<string, [number, number]>>({});

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setScale(Math.min(1, host.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Measure each handle's center in unscaled canvas coordinates. offsetLeft/
  // offsetTop are layout values (the CSS scale transform doesn't touch them), so
  // walking the offset chain up to the canvas yields exact port positions.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector<HTMLElement>(".trailer-canvas");
    if (!canvas) return;
    const measure = () => {
      const next: Record<string, [number, number]> = {};
      canvas.querySelectorAll<HTMLElement>("[data-anchor]").forEach((el) => {
        const id = el.dataset.anchor;
        if (!id) return;
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = el;
        while (node && node !== canvas) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        next[id] = [x + el.offsetWidth / 2, y + el.offsetHeight / 2];
      });
      setAnchors(next);
    };
    measure();
    // Web fonts can shift row heights after first paint; re-measure once.
    const t = window.setTimeout(measure, 300);
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
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
          <NodeCanvas className="trailer-canvas" style={{ width: W, height: H }}>
            {EDGES.map((e, i) => {
              const from = anchors[e.from];
              const to = anchors[e.to];
              if (!from || !to) return null;
              return (
                <FlowEdge key={i} from={from} to={to} color={e.color} width={edgeWidth} />
              );
            })}

            <div data-node="logline" style={{ position: "absolute", left: 40, top: 40 }}>
              <FlowNode title="Logline" icon={<Type size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value">
                  A getaway driver speeds onto a bridge as it starts to collapse.
                </NodeProperty>
                <HandleRow side="out" color="string" anchorId="logline.out" />
              </FlowNode>
            </div>

            <div data-node="style" style={{ position: "absolute", left: 40, top: 260 }}>
              <FlowNode title="Visual Style" icon={<Type size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value">
                  Cinematic film still, high-contrast daylight, dust and sparks, handheld telephoto.
                </NodeProperty>
                <HandleRow side="out" color="string" anchorId="style.out" />
              </FlowNode>
            </div>

            <div data-node="count" style={{ position: "absolute", left: 40, top: 490 }}>
              <FlowNode title="Shot Count" icon={<Hash size={16} />} style={{ position: "relative" }}>
                <NodeProperty label="Value" mono>
                  6
                </NodeProperty>
                <HandleRow side="out" color="int" anchorId="count.out" />
              </FlowNode>
            </div>

            <div data-node="director" style={{ position: "absolute", left: 470, top: 120 }}>
              <FlowNode title="Director" icon={<Clapperboard size={16} />} width={440} style={{ position: "relative" }}>
                <NodeText>
                  {`Writes the storyboard: one shot per beat, each with its own camera direction, under a single style bible.`}
                </NodeText>
                <div style={{ padding: "0 8px", marginBottom: 8 }}>
                  <NodeChip>screenplay</NodeChip>
                  <NodeChip>style bible</NodeChip>
                  <NodeChip>16:9</NodeChip>
                </div>
                <HandleRow side="in" color="string" label="Brief" anchorId="director.brief" />
                <HandleRow side="in" color="string" label="Style" anchorId="director.style" />
                <HandleRow side="in" color="int" label="Shot Count" anchorId="director.count" />
                <HandleRow side="out" color="dict" label="screenplay" anchorId="director.out" />
              </FlowNode>
            </div>

            <div data-node="shots" style={{ position: "absolute", left: 1360, top: 160 }}>
              <FlowNode title="Screenplay Shots" icon={<List size={16} />} width={320} style={{ position: "relative" }}>
                <NodeProperty label="Emits">
                  One image prompt per shot: action, camera, style bible.
                </NodeProperty>
                <HandleRow side="in" color="dict" label="Screenplay" anchorId="shots.screenplay" />
                <HandleRow side="out" color="string" label="shot_prompt" anchorId="shots.prompt" />
              </FlowNode>
            </div>

            <div data-node="keyframe" style={{ position: "absolute", left: 1740, top: 130 }}>
              <FlowNode title="Text To Image" icon={<ImageIcon size={16} />} width={320} style={{ position: "relative" }}>
                <NodePreview src="/trailer-shot-1-800.webp" ratio="16 / 9" />
                <HandleRow side="in" color="string" label="Shot" anchorId="keyframe.shot" />
                <HandleRow side="out" color="image" anchorId="keyframe.out" />
              </FlowNode>
            </div>

            <div data-node="i2v" style={{ position: "absolute", left: 2160, top: 130 }}>
              <FlowNode title="Image To Video" icon={<Film size={16} />} width={320} style={{ position: "relative" }}>
                <NodePreview src="/trailer-shot-4.webp" ratio="16 / 9" />
                <HandleRow side="in" color="image" label="Image" anchorId="i2v.image" />
                <HandleRow side="out" color="video" anchorId="i2v.out" />
              </FlowNode>
            </div>

            <div data-node="concat" style={{ position: "absolute", left: 2580, top: 150 }}>
              <FlowNode title="🎬 Final trailer" icon={<Film size={16} />} width={340} style={{ position: "relative" }}>
                <NodePreview
                  src="/movie_trailer_example.mp4"
                  poster="/trailer-shot-4.webp"
                  video
                  ratio="16 / 9"
                />
                <HandleRow side="in" color="video" label="Videos" anchorId="concat.video" />
                <HandleRow side="out" color="video" anchorId="concat.out" />
              </FlowNode>
            </div>
          </NodeCanvas>
        </div>
      </div>
    </div>
  );
}
