import type { ModuleConfig } from "../types.js";

export const audioSeparateConfig: ModuleConfig = {
  configs: {
    "ryan5453/demucs": {
      className: "Demucs",
      returnType: "audio",
      fieldOverrides: {
        audio: { propType: "audio" }
      }
    }
  }
};
