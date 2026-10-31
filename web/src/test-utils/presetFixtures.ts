import { presetSchema, type Preset } from "@nodetool-ai/presets";

export const makePreset = (
  id: string,
  extra: Partial<Record<string, unknown>> = {}
): Preset =>
  presetSchema.parse({
    id,
    version: 1,
    kind: "camera",
    name: id.split(".")[1],
    description: `${id} description`,
    modes: ["video"],
    stackable: true,
    prompt: { default: id, kling: id },
    ...extra
  });

export const PREVIEW = {
  url: "https://previews.example.com/dolly.mp4",
  poster: "https://previews.example.com/dolly.jpg",
  run: "runs/camera.dolly.json"
};
