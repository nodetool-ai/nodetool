/** Settings forwarded by the generic generation paths, shared with ejection. */
export function presetParameterKeys(mode: string): readonly string[] {
  return mode === "image"
    ? ["width", "height", "aspect_ratio", "resolution", "seed"]
    : mode === "image_edit"
      ? [
          "width",
          "height",
          "strength",
          "num_inference_steps",
          "seed",
          "aspect_ratio",
          "resolution"
        ]
      : [
          "aspect_ratio",
          "resolution",
          "duration_seconds",
          "num_inference_steps"
        ];
}
