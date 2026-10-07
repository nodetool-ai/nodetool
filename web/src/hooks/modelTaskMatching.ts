import type { ImageModelTask, VideoModelTask } from "./useModelsByProvider";

/** The model task a node's `model` property must support, by node type. */
export const IMAGE_TASK_BY_NODE_TYPE: Record<
  string,
  ImageModelTask | ImageModelTask[]
> = {
  "nodetool.image.TextToImage": "text_to_image",
  "nodetool.image.ImageToImage": "image_to_image",
  "nodetool.image.Upscale": "upscale",
  "nodetool.image.RemoveBackground": "remove_background",
  "nodetool.image.EstimateDepth": "estimate_depth",
  "nodetool.image.Segment": "segment",
  "nodetool.image.Relight": ["image_to_image", "relight"],
  "nodetool.image.Vectorize": "vectorize"
};

export const VIDEO_TASK_BY_NODE_TYPE: Record<string, VideoModelTask> = {
  "nodetool.video.TextToVideo": "text_to_video",
  "nodetool.video.ImageToVideo": "image_to_video",
  "nodetool.video.ReferenceToVideo": "reference_to_video",
  "nodetool.video.VideoToVideo": "video_to_video",
  "nodetool.video.LipSync": "lip_sync"
};

const STRICT_MODEL_TASKS = new Set<string>([
  "inpainting",
  "outpaint",
  "upscale",
  "remove_background",
  "relight",
  "vectorize",
  "segment",
  "estimate_depth",
  "video_to_video",
  "extend_video",
  "upscale_video",
  "interpolate_video",
  "outpaint_video",
  "reference_to_video",
  "lip_sync"
]);

/** Match the model picker: undeclared tasks pass only for basic generation. */
export const modelMatchesTask = (
  supportedTasks: string[] | null | undefined,
  task: string
): boolean => {
  if (!supportedTasks || supportedTasks.length === 0) {
    return !STRICT_MODEL_TASKS.has(task);
  }
  return supportedTasks.includes(task);
};
