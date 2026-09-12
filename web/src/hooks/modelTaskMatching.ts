const STRICT_MODEL_TASKS = new Set<string>([
  "inpainting",
  "outpaint",
  "upscale",
  "remove_background",
  "relight",
  "vectorize",
  "segment",
  "video_to_video",
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
