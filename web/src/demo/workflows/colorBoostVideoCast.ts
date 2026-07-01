/**
 * Workflow gallery — Color Boost Video.
 *
 *   Video → For Each Frame → Exposure → Saturation/Vibrance → Frame To Video
 *
 * Grade a clip frame by frame — lift exposure and boost saturation, then
 * reassemble. Fully synthetic — a tiny inline clip and a graded still stand in
 * for the run, so it replays with no backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, meta, out, prop } from "../castHelpers";
import { SAMPLE_VIDEO_WEBM_DATA_URI } from "../assets/sampleMedia";
import { VIDEO_STILL_IMAGE_DATA_URI } from "../assets/cookbookImages";
import { cookbookWorkflow, edge, fitViewport, node } from "../cookbook/builders";
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";

const VIDEO_CONST = "nodetool.constant.Video";
const FOR_EACH_FRAME = "nodetool.video.ForEachFrame";
const EXPOSURE = "lib.image.color_grading.Exposure";
const SATURATION = "lib.image.color_grading.SaturationVibrance";
const FRAME_TO_VIDEO = "nodetool.video.FrameToVideo";

const WF = "wf-workflow-color-boost-video";
const JOB = "workflow-color-boost-video-job";
const m = castMessages(WF, JOB);

const video = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };
const graded = { type: "video", uri: SAMPLE_VIDEO_WEBM_DATA_URI, metadata: { format: "webm" } };
const frame = { type: "image", uri: VIDEO_STILL_IMAGE_DATA_URI };

const nodes = [
  node("clip", VIDEO_CONST, 0, 170, 300, "Video", { value: video }),
  node("frames", FOR_EACH_FRAME, 420, 170, 280, "For Each Frame", {}),
  node("exposure", EXPOSURE, 780, 20, 280, "Exposure", {}),
  node("saturation", SATURATION, 780, 320, 300, "Saturation / Vibrance", {}),
  node("assemble", FRAME_TO_VIDEO, 1180, 170, 300, "Frame To Video", {}),
  node("output", PREVIEW_NODE_TYPE, 1560, 170, 300, "Graded Clip", {}),
];
const edges = [
  edge("e1", "clip", "output", "frames", "video"),
  edge("e2", "frames", "frame", "exposure", "image"),
  edge("e3", "exposure", "output", "saturation", "image"),
  edge("e4", "saturation", "output", "assemble", "frame"),
  edge("e5", "frames", "index", "assemble", "index"),
  edge("e6", "assemble", "output", "output", "value"),
];

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "clip", "Video", VIDEO_CONST, "running"),
  m.nodeUpdate(1300, "clip", "Video", VIDEO_CONST, "completed", { output: video }),
  m.edgeUpdate(1500, "e1", "active"),

  m.nodeUpdate(2100, "frames", "For Each Frame", FOR_EACH_FRAME, "running"),
  m.edgeUpdate(2300, "e2", "active"),
  m.edgeUpdate(2350, "e5", "active"),
  ...m.progress("frames", 6, 2500, 900),

  m.nodeUpdate(3600, "exposure", "Exposure", EXPOSURE, "running"),
  ...m.progress("exposure", 6, 3800, 1800),
  m.nodeUpdate(6000, "exposure", "Exposure", EXPOSURE, "completed", { output: frame }),
  m.edgeUpdate(6200, "e2", "completed"),
  m.edgeUpdate(6400, "e3", "active"),

  m.nodeUpdate(7000, "saturation", "Saturation / Vibrance", SATURATION, "running"),
  ...m.progress("saturation", 6, 7200, 1800),
  m.nodeUpdate(9400, "saturation", "Saturation / Vibrance", SATURATION, "completed", { output: frame }),
  m.edgeUpdate(9600, "e3", "completed"),
  m.edgeUpdate(9800, "e4", "active"),

  m.nodeUpdate(10400, "assemble", "Frame To Video", FRAME_TO_VIDEO, "running"),
  ...m.progress("assemble", 10, 10600, 3000),
  m.nodeUpdate(14000, "assemble", "Frame To Video", FRAME_TO_VIDEO, "completed", { output: graded }),
  m.edgeUpdate(14100, "e4", "completed"),
  m.edgeUpdate(14200, "e5", "completed"),
  m.edgeUpdate(14400, "e6", "active"),

  m.nodeUpdate(15000, "output", "Graded Clip", PREVIEW_NODE_TYPE, "running"),
  m.output(15400, "output", "Graded Clip", "value", graded, "video"),
  m.nodeUpdate(15800, "output", "Graded Clip", PREVIEW_NODE_TYPE, "completed", { value: graded }),
  m.edgeUpdate(16000, "e6", "completed"),
  m.jobUpdate(16300, "completed", { outputs: { value: graded } }),
];

const videoConstMeta = () =>
  meta({
    node_type: VIDEO_CONST,
    title: "Video",
    body: "content_card",
    properties: [prop("value", "video")],
    outputs: [out("output", "video")],
    inline_fields: ["value"],
  });

const forEachFrameMeta = () =>
  meta({
    node_type: FOR_EACH_FRAME,
    title: "For Each Frame",
    properties: [prop("video", "video")],
    outputs: [
      out("frame", "image", true),
      out("index", "int", true),
      out("fps", "float"),
    ],
    input_fields: ["video"],
    is_streaming_output: true,
  });

const gradeMeta = (nodeType: string, title: string) =>
  meta({
    node_type: nodeType,
    title,
    body: "content_card",
    properties: [prop("image", "image")],
    outputs: [out("output", "image")],
    input_fields: ["image"],
  });

const frameToVideoMeta = () =>
  meta({
    node_type: FRAME_TO_VIDEO,
    title: "Frame To Video",
    body: "content_card",
    properties: [prop("frame", "image"), prop("index", "int"), prop("fps", "float")],
    outputs: [out("output", "video")],
    input_fields: ["frame", "index", "fps"],
  });

const previewVideoMeta = () =>
  meta({
    node_type: PREVIEW_NODE_TYPE,
    title: "Graded Clip",
    properties: [prop("value", "any")],
    outputs: [out("output", "any")],
  });

export const colorBoostVideoCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-color-boost-video",
  name: "Color Boost Video",
  description: "Grade a clip frame by frame — exposure and saturation — then reassemble.",
  createdAt: new Date(0).toISOString(),
  durationMs: 17000,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Color Boost Video",
    "Video → For Each Frame → Exposure → Saturation → Frame To Video.",
    nodes,
    edges
  ),
  metadata: {
    [VIDEO_CONST]: videoConstMeta(),
    [FOR_EACH_FRAME]: forEachFrameMeta(),
    [EXPOSURE]: gradeMeta(EXPOSURE, "Exposure"),
    [SATURATION]: gradeMeta(SATURATION, "Saturation / Vibrance"),
    [FRAME_TO_VIDEO]: frameToVideoMeta(),
    [PREVIEW_NODE_TYPE]: previewVideoMeta(),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
