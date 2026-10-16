import { z } from "zod";
import { gameEnvironment3D } from "./components/environment.js";
import { gameLight3D } from "./components/light.js";
import { gameQuaternion3D } from "./components/transform.js";

export const GAME_ENVIRONMENT_PRESET_IDS_3D = ["sunny-day", "night", "overcast", "neon-interior"] as const;
export const gameEnvironmentPresetId3D = z.enum(GAME_ENVIRONMENT_PRESET_IDS_3D);
export type GameEnvironmentPresetId3D = z.infer<typeof gameEnvironmentPresetId3D>;

export const gameEnvironmentPreset3D = z.strictObject({
  id: gameEnvironmentPresetId3D,
  label: z.string().min(1),
  environment: gameEnvironment3D,
  sun: z.strictObject({ light: gameLight3D.options[0], rotation: gameQuaternion3D })
});
export type GameEnvironmentPreset3D = z.infer<typeof gameEnvironmentPreset3D>;

const PRESETS: Record<GameEnvironmentPresetId3D, z.input<typeof gameEnvironmentPreset3D>> = {
  "sunny-day": {
    id: "sunny-day", label: "Sunny day",
    environment: { background: "#87b9e8", ambient: { color: "#e6efff", intensity: 0.35 },
      sky: { kind: "procedural", turbidity: 2, rayleigh: 2, groundColor: "#76715f", intensity: 1 },
      fog: { color: "#c4d9ed", near: 80, far: 300 },
      postProcessing: { exposure: 1, toneMapping: "aces" } },
    sun: { light: { kind: "directional", color: "#fff3d9", intensity: 3, castShadow: true, shadowNormalBias: 0.02 },
      rotation: [-0.382683432365, 0, 0, 0.923879532511] }
  },
  night: {
    id: "night", label: "Night",
    environment: { background: "#050b1b", ambient: { color: "#6889c7", intensity: 0.12 }, sky: { kind: "color" },
      fog: { color: "#0c1630", near: 30, far: 180 },
      postProcessing: { exposure: 0.8, toneMapping: "aces", bloom: { threshold: 1, intensity: 0.35 } } },
    sun: { light: { kind: "directional", color: "#91adff", intensity: 0.35, castShadow: true, shadowNormalBias: 0.02 },
      rotation: [-0.258819045103, 0, 0, 0.965925826289] }
  },
  overcast: {
    id: "overcast", label: "Overcast",
    environment: { background: "#b3bfca", ambient: { color: "#e4e9ee", intensity: 0.8 },
      sky: { kind: "procedural", turbidity: 20, rayleigh: 0.3, groundColor: "#737977", intensity: 0.65 },
      fog: { color: "#bac6ce", near: 40, far: 220 }, postProcessing: { exposure: 1, toneMapping: "neutral" } },
    sun: { light: { kind: "directional", color: "#e1e7ee", intensity: 0.5, castShadow: false },
      rotation: [-0.382683432365, 0, 0, 0.923879532511] }
  },
  "neon-interior": {
    id: "neon-interior", label: "Neon interior",
    environment: { background: "#090416", ambient: { color: "#9469cf", intensity: 0.25 }, sky: { kind: "color" },
      fog: { color: "#160c29", near: 15, far: 80 },
      postProcessing: { exposure: 1, toneMapping: "agx", bloom: { threshold: 0.8, intensity: 0.8 }, vignette: { intensity: 0.3 } } },
    sun: { light: { kind: "directional", color: "#61e5ff", intensity: 0.6, castShadow: false },
      rotation: [-0.382683432365, 0, 0, 0.923879532511] }
  }
};

/** Return a parsed copy so editing a scene cannot mutate the shared preset catalog. */
export function getGameEnvironmentPreset3D(id: GameEnvironmentPresetId3D): GameEnvironmentPreset3D {
  return gameEnvironmentPreset3D.parse(PRESETS[gameEnvironmentPresetId3D.parse(id)]);
}
