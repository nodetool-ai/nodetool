import type { ModuleConfig } from "../types.js";

export const imageGenerateConfig: ModuleConfig = {
  configs: {
    "logerzhu/ad-inpaint": {
      className: "AdInpaint",
      returnType: "image",
      fieldOverrides: {
        image_path: { propType: "image" },
      },
    },
    "sdxl-based/consistent-character": {
      className: "ConsistentCharacter",
      returnType: "image",
      fieldOverrides: {
        subject: { propType: "image" },
      },
    },
    "fofr/pulid-base": {
      className: "PulidBase",
      returnType: "image",
      fieldOverrides: {
        face_image: { propType: "image" },
      },
    },
    "stability-ai/stable-diffusion": {
      className: "StableDiffusion",
      returnType: "image",
    },
    "stability-ai/stable-diffusion-3.5-medium": {
      className: "StableDiffusion3_5_Medium",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "stability-ai/stable-diffusion-3.5-large": {
      className: "StableDiffusion3_5_Large",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "stability-ai/stable-diffusion-3.5-large-turbo": {
      className: "StableDiffusion3_5_Large_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "luma/photon-flash": {
      className: "Photon_Flash",
      returnType: "image",
      fieldOverrides: {
        image_reference_url: { propType: "image" },
        style_reference_url: { propType: "image" },
        character_reference_url: { propType: "image" },
      },
    },
    "stability-ai/sdxl": {
      className: "StableDiffusionXL",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "swartype/sdxl-pixar": {
      className: "SDXL_Pixar",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "fofr/sdxl-emoji": {
      className: "SDXL_Emoji",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "stability-ai/stable-diffusion-inpainting": {
      className: "StableDiffusionInpainting",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "ai-forever/kandinsky-2.2": {
      className: "Kandinsky",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-schnell": {
      className: "Flux_Schnell",
      returnType: "image",
    },
    "black-forest-labs/flux-dev": {
      className: "Flux_Dev",
      returnType: "image",
    },
    "black-forest-labs/flux-pro": {
      className: "Flux_Pro",
      returnType: "image",
    },
    "black-forest-labs/flux-1.1-pro-ultra": {
      className: "Flux_1_1_Pro_Ultra",
      returnType: "image",
    },
    "black-forest-labs/flux-dev-lora": {
      className: "Flux_Dev_Lora",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-schnell-lora": {
      className: "Flux_Schnell_Lora",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-depth-pro": {
      className: "Flux_Depth_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-canny-pro": {
      className: "Flux_Canny_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-fill-pro": {
      className: "Flux_Fill_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-depth-dev": {
      className: "Flux_Depth_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "bytedance/hyper-flux-8step": {
      className: "Hyper_Flux_8Step",
      returnType: "image",
    },
    "fofr/flux-mona-lisa": {
      className: "Flux_Mona_Lisa",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "adirik/flux-cinestill": {
      className: "Flux_Cinestill",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "fofr/flux-black-light": {
      className: "Flux_Black_Light",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "igorriti/flux-360": {
      className: "Flux_360",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "recraft-ai/recraft-v3": {
      className: "Recraft_V3",
      returnType: "image",
    },
    "recraft-ai/recraft-20b": {
      className: "Recraft_20B",
      returnType: "image",
    },
    "recraft-ai/recraft-20b-svg": {
      className: "Recraft_20B_SVG",
      returnType: "image",
    },
    "recraft-ai/recraft-v3-svg": {
      className: "Recraft_V3_SVG",
      returnType: "image",
    },
    "black-forest-labs/flux-canny-dev": {
      className: "Flux_Canny_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-fill-dev": {
      className: "Flux_Fill_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-redux-schnell": {
      className: "Flux_Redux_Schnell",
      returnType: "image",
      fieldOverrides: {
        redux_image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-redux-dev": {
      className: "Flux_Redux_Dev",
      returnType: "image",
      fieldOverrides: {
        redux_image: { propType: "image" },
      },
    },
    "lucataco/sdxl-controlnet": {
      className: "SDXL_Controlnet",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "catacolabs/sdxl-ad-inpaint": {
      className: "SDXL_Ad_Inpaint",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "bytedance/sdxl-lightning-4step": {
      className: "StableDiffusionXLLightning",
      returnType: "image",
    },
    "playgroundai/playground-v2.5-1024px-aesthetic": {
      className: "PlaygroundV2",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "datacte/proteus-v0.2": {
      className: "Proteus_V_02",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "datacte/proteus-v0.3": {
      className: "Proteus_V_03",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "fofr/sticker-maker": {
      className: "StickerMaker",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "fofr/style-transfer": {
      className: "StyleTransfer",
      returnType: "image",
      fieldOverrides: {
        structure_image: { propType: "image" },
        style_image: { propType: "image" },
      },
    },
    "fofr/illusions": {
      className: "Illusions",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        control_image: { propType: "image" },
        mask_image: { propType: "image" },
      },
    },
    "ideogram-ai/ideogram-v2": {
      className: "Ideogram_V2",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "ideogram-ai/ideogram-v2-turbo": {
      className: "Ideogram_V2_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "ideogram-ai/ideogram-v2a": {
      className: "Ideogram_V2A",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "google/imagen-3": {
      className: "Imagen_3",
      returnType: "image",
    },
    "qwen/qwen-image": {
      className: "Qwen_Image",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "qwen/qwen-image-edit": {
      className: "Qwen_Image_Edit",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "bytedance/seedream-4": {
      className: "Seedream_4",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "minimax/image-01": {
      className: "Minimax_Image_01",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "black-forest-labs/flux-2-pro": {
      className: "Flux_2_Pro",
      returnType: "image",
    },
    "black-forest-labs/flux-2-flex": {
      className: "Flux_2_Flex",
      returnType: "image",
    },
    "openai/gpt-image-1.5": {
      className: "GPT_Image_1_5",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "black-forest-labs/flux-2-max": {
      className: "Flux_2_Max",
      returnType: "image",
    },
    "google/imagen-4-fast": {
      className: "Imagen_4_Fast",
      returnType: "image",
    },
    "ideogram-ai/ideogram-v3-turbo": {
      className: "Ideogram_V3_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" },
      },
    },
    "black-forest-labs/flux-kontext-pro": {
      className: "Flux_Kontext_Pro",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
  },
};
