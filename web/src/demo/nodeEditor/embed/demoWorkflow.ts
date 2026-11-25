/**
 * The graph the node editor demo opens with: a prompt, a still made from it,
 * and a clip made from the still.
 */
import type { Workflow } from "../../../stores/ApiTypes";
import { node, edge } from "../../castHelpers";

export const DEMO_WORKFLOW_ID = "node-editor-demo";

const PROMPT = "A lighthouse on a volcanic coast at golden hour";

const IMAGE_MODEL = {
  type: "image_model",
  provider: "fal_ai",
  id: "fal-ai/flux/schnell",
  name: "FLUX.1 Schnell",
  path: null,
  supported_tasks: []
};

const VIDEO_MODEL = {
  type: "video_model",
  provider: "gemini",
  id: "veo-3.1-generate-preview",
  name: "Veo 3.1 Preview",
  path: null,
  supported_tasks: []
};

/**
 * Node positions. A phone gets a column, because a row of three nodes only
 * fits a narrow frame at an unreadable zoom.
 */
const LAYOUTS = {
  row: { prompt: [0, 120], image: [340, 60], video: [720, 60] },
  column: { prompt: [0, 0], image: [30, 210], video: [0, 510] }
} as const;

export type DemoLayout = keyof typeof LAYOUTS;

/** A fresh copy each call, so Start over begins from the original graph. */
export function createDemoWorkflow(layout: DemoLayout = "row"): Workflow {
  const at = LAYOUTS[layout];
  const timestamp = new Date(0).toISOString();
  return {
    id: DEMO_WORKFLOW_ID,
    name: "Still to clip",
    access: "private",
    description: "Write a prompt, make a still, animate it.",
    thumbnail: "",
    tags: [],
    run_mode: "workflow",
    settings: {},
    updated_at: timestamp,
    created_at: timestamp,
    graph: {
      nodes: [
        node("prompt", "nodetool.input.StringInput", at.prompt[0], at.prompt[1], 260, "Prompt", {
          name: "prompt",
          value: PROMPT,
          line_mode: "multi_line"
        }),
        node("image", "nodetool.image.TextToImage", at.image[0], at.image[1], 300, "Text To Image", {
          prompt: "",
          model: IMAGE_MODEL,
          aspect_ratio: "16:9",
          resolution: "1K"
        }),
        node("video", "nodetool.video.ImageToVideo", at.video[0], at.video[1], 300, "Image To Video", {
          image: [],
          prompt: "Slow push in, waves rolling against the rocks",
          model: VIDEO_MODEL,
          aspect_ratio: "16:9",
          resolution: "720p",
          duration: 5
        })
      ],
      edges: [
        edge("e-prompt-image", "prompt", "output", "image", "prompt"),
        edge("e-image-video", "image", "output", "video", "image")
      ]
    }
  };
}
