import "../guest/env/index.mjs";
import { Buffer } from "buffer/";
globalThis.Buffer ??= Buffer;
const mod = await import("@nodetool-ai/video-nodes/nodes/timeline");
const classes = Object.values(mod).filter(
  (v) => typeof v === "function" && v.nodeType
);
const types = classes.map((c) => c.nodeType).sort();
for (const type of [
  "nodetool.timeline.Transcript",
  "nodetool.timeline.AddClips",
  "nodetool.timeline.FillTimelineText",
  "nodetool.timeline.RetargetTimeline"
]) {
  const cls = classes.find((c) => c.nodeType === type);
  if (!cls) {
    throw new Error(type + " did not load");
  }
  new cls();
}
const node = new mod.TimelineTranscriptNode();
node.timeline = { type: "timeline", id: "0123456789abcdef0123456789abcdef" };
const sequence = {
  id: "0123456789abcdef0123456789abcdef",
  name: "Canvas regression",
  tracks: [],
  clips: [],
  transcript: [{ text: "Successful native timeline fixture" }]
};
const result = await node.process({
  getTimelineSequence: async (id) =>
    id === "0123456789abcdef0123456789abcdef" ? sequence : null
});
if (result.text !== "Successful native timeline fixture") {
  throw new Error(JSON.stringify(result));
}
const { NodeRasterizer } =
  await import("../../../packages/video-nodes/src/nodes/timeline/rasterizers.ts");
const rasterizer = new NodeRasterizer(128, 96);
const raster = rasterizer.text({
  text: "Timeline",
  fontFamily: "Inter",
  fontSizePx: 20,
  color: "#ffffff",
  shadow: { color: "#000000", blurPx: 2, offsetX: 1, offsetY: 1 }
});
if (
  !raster ||
  raster.width !== 128 ||
  raster.height !== 96 ||
  !raster.rgba.some((v, i) => i % 4 === 3 && v > 0)
) {
  throw new Error("NodeRasterizer authored shadow did not render");
}
globalThis.canvasResult = JSON.stringify({
  types,
  result,
  shadowRasterBytes: raster.rgba.length
});
