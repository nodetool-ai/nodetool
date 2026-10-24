import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "mureka/api/generate/lyrics": {
      className: "MurekaLyrics",
      docstring: "Mureka writes song lyrics from a prompt.",
      tags: ["text", "text-to-text", "lyrics", "music", "mureka"]
    }
  }
};
