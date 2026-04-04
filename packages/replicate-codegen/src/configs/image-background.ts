import type { ModuleConfig } from "../types.js";

export const imageBackgroundConfig: ModuleConfig = {
  configs: {
    "851-labs/background-remover": {
      className: "BackgroundRemover_851",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/remove-background": {
      className: "Bria_RemoveBackground",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/eraser": {
      className: "Bria_Eraser",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "bria/generate-background": {
      className: "Bria_GenerateBackground",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/genfill": {
      className: "Bria_GenFill",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "bria/fibo-edit": {
      className: "Bria_FiboEdit",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "codeplugtech/background_remover": {
      className: "BackgroundRemover_Codeplug",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "men1scus/birefnet": {
      className: "BiRefNet",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "smoretalk/rembg-enhance": {
      className: "RembgEnhance",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zylim0702/remove_bg": {
      className: "RemoveBg",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/remove-bg": {
      className: "RemoveBgLucataco",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/rembg-video": {
      className: "RembgVideo",
      returnType: "video",
      fieldOverrides: { video: { propType: "video" } }
    }
  }
};
