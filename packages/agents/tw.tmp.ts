import { writeFileSync } from "node:fs";
import { renderTimelineFrames } from "./src/timeline-preview/frames.js";
const base = { sourceType: "imported", status: "generated", locked: false, versions: [] };
const T = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } };
function doc(v: string) {
  const tw: Record<string, unknown> = { id: "a1", role: "in", preset: "typewriter", durationMs: 1400, delayMs: v.includes("delay") ? 266 : 0 };
  if (v.includes("custom")) { tw.preset = "custom"; tw.durationMs = 1; tw.custom = { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1, easing: "linear" }] }] }; tw.stagger = { unit: "character", offsetMs: 21 }; }
  if (v.includes("caret")) tw.caret = { color: "#a78bfa", widthPx: 3, blinkPeriodMs: 533 };
  const text = { ...base, id: "t", name: "t", trackId: "k1", startMs: 0, durationMs: 3800, mediaType: "text", transform: T,
    textStyle: { text: "Signed. Thanks for chasing this. Sending the countersigned copy now.", fontFamily: "Inter", fontSizePx: 36, fontWeight: 400, color: "#ffffff", align: "left", maxWidthFrac: 0.47, ...(v.includes("lh") ? { lineHeight: 1.4, letterSpacingPx: -0.36 } : {}) },
    animations: [tw] } as Record<string, unknown>;
  const clips: Record<string, unknown>[] = [text];
  if (v.includes("group")) {
    clips.push({ ...base, id: "g", name: "g", trackId: "k0", startMs: 0, durationMs: 3800, mediaType: "group", transform: T,
      animations: [{ id: "a2", role: "in", preset: "custom", delayMs: 0, durationMs: 333, custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }] } }] });
    text.parentId = "g";
  }
  return { tracks: [{ id: "k0", name: "k0", type: "video", index: 0, visible: true, locked: false }, { id: "k1", name: "k1", type: "video", index: 1, visible: true, locked: false }], clips, markers: [] };
}
for (const v of ["custom", "custom delay caret"]) {
  const r = await renderTimelineFrames({ sequence: { ...doc(v), fps: 30, width: 1920, height: 1080, durationMs: 3800 } as never, timesMs: [800, 1200, 2000], width: 640, loadAsset: async () => null });
  const lit = r.frames.map((f) => { writeFileSync(`${process.env.SP}/tw-${v.replace(/ /g, "_")}-${f.time_ms}.png`, f.png); return f.png.length; });
  console.log(v.padEnd(22), "png bytes @800/@1600:", lit.join(" / "));
}
