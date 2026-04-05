import type { ModuleConfig } from "../types.js";

export const audioEnhanceConfig: ModuleConfig = {
  configs: {
    "nateraw/audio-super-resolution": {
      className: "AudioSuperResolution",
      returnType: "audio",
      fieldOverrides: {
        input_file: { propType: "audio" }
      }
    }
  }
};
