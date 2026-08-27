import type { ModuleConfig } from "../types.js";

export const imageGenerateConfig: ModuleConfig = {
  configs: {
    "logerzhu/ad-inpaint": {
      className: "AdInpaint",
      returnType: "image",
      fieldOverrides: {
        image_path: { propType: "image" }
      }
    },
    "sdxl-based/consistent-character": {
      className: "ConsistentCharacter",
      returnType: "image",
      fieldOverrides: {
        subject: { propType: "image" }
      }
    },
    "fofr/pulid-base": {
      className: "PulidBase",
      returnType: "image",
      fieldOverrides: {
        face_image: { propType: "image" }
      }
    },
    "stability-ai/stable-diffusion": {
      className: "StableDiffusion",
      returnType: "image"
    },
    "stability-ai/stable-diffusion-3.5-medium": {
      className: "StableDiffusion3_5_Medium",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "stability-ai/stable-diffusion-3.5-large": {
      className: "StableDiffusion3_5_Large",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "stability-ai/stable-diffusion-3.5-large-turbo": {
      className: "StableDiffusion3_5_Large_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "luma/photon-flash": {
      className: "Photon_Flash",
      returnType: "image",
      fieldOverrides: {
        image_reference_url: { propType: "image" },
        style_reference_url: { propType: "image" },
        character_reference_url: { propType: "image" }
      }
    },
    "stability-ai/sdxl": {
      className: "StableDiffusionXL",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "swartype/sdxl-pixar": {
      className: "SDXL_Pixar",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "fofr/sdxl-emoji": {
      className: "SDXL_Emoji",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "stability-ai/stable-diffusion-inpainting": {
      className: "StableDiffusionInpainting",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "ai-forever/kandinsky-2.2": {
      className: "Kandinsky",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-schnell": {
      className: "Flux_Schnell",
      returnType: "image"
    },
    "black-forest-labs/flux-dev": {
      className: "Flux_Dev",
      returnType: "image"
    },
    "black-forest-labs/flux-pro": {
      className: "Flux_Pro",
      returnType: "image"
    },
    "black-forest-labs/flux-1.1-pro-ultra": {
      className: "Flux_1_1_Pro_Ultra",
      returnType: "image"
    },
    "black-forest-labs/flux-dev-lora": {
      className: "Flux_Dev_Lora",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-schnell-lora": {
      className: "Flux_Schnell_Lora",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-depth-pro": {
      className: "Flux_Depth_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-canny-pro": {
      className: "Flux_Canny_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-fill-pro": {
      className: "Flux_Fill_Pro",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-depth-dev": {
      className: "Flux_Depth_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "bytedance/hyper-flux-8step": {
      className: "Hyper_Flux_8Step",
      returnType: "image"
    },
    "fofr/flux-mona-lisa": {
      className: "Flux_Mona_Lisa",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "adirik/flux-cinestill": {
      className: "Flux_Cinestill",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "fofr/flux-black-light": {
      className: "Flux_Black_Light",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "igorriti/flux-360": {
      className: "Flux_360",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "recraft-ai/recraft-v3": {
      className: "Recraft_V3",
      returnType: "image"
    },
    "recraft-ai/recraft-20b": {
      className: "Recraft_20B",
      returnType: "image"
    },
    "recraft-ai/recraft-20b-svg": {
      className: "Recraft_20B_SVG",
      returnType: "image"
    },
    "recraft-ai/recraft-v3-svg": {
      className: "Recraft_V3_SVG",
      returnType: "image"
    },
    "black-forest-labs/flux-canny-dev": {
      className: "Flux_Canny_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-fill-dev": {
      className: "Flux_Fill_Dev",
      returnType: "image",
      fieldOverrides: {
        control_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-redux-schnell": {
      className: "Flux_Redux_Schnell",
      returnType: "image",
      fieldOverrides: {
        redux_image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-redux-dev": {
      className: "Flux_Redux_Dev",
      returnType: "image",
      fieldOverrides: {
        redux_image: { propType: "image" }
      }
    },
    "lucataco/sdxl-controlnet": {
      className: "SDXL_Controlnet",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "catacolabs/sdxl-ad-inpaint": {
      className: "SDXL_Ad_Inpaint",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "bytedance/sdxl-lightning-4step": {
      className: "StableDiffusionXLLightning",
      returnType: "image"
    },
    "playgroundai/playground-v2.5-1024px-aesthetic": {
      className: "PlaygroundV2",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "datacte/proteus-v0.2": {
      className: "Proteus_V_02",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "datacte/proteus-v0.3": {
      className: "Proteus_V_03",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "fofr/sticker-maker": {
      className: "StickerMaker",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "fofr/style-transfer": {
      className: "StyleTransfer",
      returnType: "image",
      fieldOverrides: {
        structure_image: { propType: "image" },
        style_image: { propType: "image" }
      }
    },
    "fofr/illusions": {
      className: "Illusions",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        control_image: { propType: "image" },
        mask_image: { propType: "image" }
      }
    },
    "ideogram-ai/ideogram-v2": {
      className: "Ideogram_V2",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "ideogram-ai/ideogram-v2-turbo": {
      className: "Ideogram_V2_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "ideogram-ai/ideogram-v2a": {
      className: "Ideogram_V2A",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "google/imagen-3": {
      className: "Imagen_3",
      returnType: "image"
    },
    "qwen/qwen-image": {
      className: "Qwen_Image",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "qwen/qwen-image-edit": {
      className: "Qwen_Image_Edit",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "bytedance/seedream-4": {
      className: "Seedream_4",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "minimax/image-01": {
      className: "Minimax_Image_01",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "black-forest-labs/flux-2-pro": {
      className: "Flux_2_Pro",
      returnType: "image"
    },
    "black-forest-labs/flux-2-flex": {
      className: "Flux_2_Flex",
      returnType: "image"
    },
    "openai/gpt-image-1.5": {
      className: "GPT_Image_1_5",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "black-forest-labs/flux-2-max": {
      className: "Flux_2_Max",
      returnType: "image"
    },
    "google/imagen-4-fast": {
      className: "Imagen_4_Fast",
      returnType: "image"
    },
    "ideogram-ai/ideogram-v3-turbo": {
      className: "Ideogram_V3_Turbo",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "black-forest-labs/flux-kontext-pro": {
      className: "Flux_Kontext_Pro",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "bytedance/seedream-4.5": {
      className: "Seedream_4_5",
      returnType: "image"
    },
    "bytedance/seedream-5-lite": {
      className: "Seedream_5_Lite",
      returnType: "image"
    },
    "bytedance/seedream-3": {
      className: "Seedream_3",
      returnType: "image"
    },
    "recraft-ai/recraft-v4": {
      className: "Recraft_V4",
      returnType: "image"
    },
    "recraft-ai/recraft-v4-svg": {
      className: "Recraft_V4_SVG",
      returnType: "image"
    },
    "recraft-ai/recraft-v4-pro": {
      className: "Recraft_V4_Pro",
      returnType: "image"
    },
    "recraft-ai/recraft-v4-pro-svg": {
      className: "Recraft_V4_Pro_SVG",
      returnType: "image"
    },
    "ideogram-ai/ideogram-v3-balanced": {
      className: "Ideogram_V3_Balanced",
      returnType: "image"
    },
    "ideogram-ai/ideogram-v3-quality": {
      className: "Ideogram_V3_Quality",
      returnType: "image"
    },
    "ideogram-ai/ideogram-v2a-turbo": {
      className: "Ideogram_V2A_Turbo",
      returnType: "image"
    },
    "google/imagen-4": {
      className: "Imagen_4",
      returnType: "image"
    },
    "google/imagen-4-ultra": {
      className: "Imagen_4_Ultra",
      returnType: "image"
    },
    "google/imagen-3-fast": {
      className: "Imagen_3_Fast",
      returnType: "image"
    },
    "google/nano-banana-pro": {
      className: "Nano_Banana_Pro",
      returnType: "image"
    },
    "xai/grok-imagine-image": {
      className: "Grok_Imagine_Image",
      returnType: "image"
    },
    "bria/fibo": {
      className: "Fibo",
      returnType: "image"
    },
    "bria/image-3.2": {
      className: "Bria_Image_3_2",
      returnType: "image"
    },
    "black-forest-labs/flux-2-klein-4b": {
      className: "Flux_2_Klein_4B",
      returnType: "image"
    },
    "black-forest-labs/flux-kontext-max": {
      className: "Flux_Kontext_Max",
      returnType: "image"
    },
    "tencent/hunyuan-image-3": {
      className: "Hunyuan_Image_3",
      returnType: "image"
    },
    "bytedance/flux-pulid": {
      className: "Flux_PuLID",
      returnType: "image",
      fieldOverrides: { face_image: { propType: "image" } }
    },
    "bytedance/pulid": {
      className: "PuLID",
      returnType: "image",
      fieldOverrides: { face_image: { propType: "image" } }
    },
    "flux-kontext-apps/change-haircut": {
      className: "Flux_Change_Haircut",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "flux-kontext-apps/professional-headshot": {
      className: "Flux_Professional_Headshot",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "flux-kontext-apps/restore-image": {
      className: "Flux_Restore_Image",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "ideogram-ai/ideogram-character": {
      className: "Ideogram_Character",
      returnType: "image"
    },
    "lucataco/omnigen2": {
      className: "OmniGen2",
      returnType: "image"
    },
    "prunaai/flux-kontext-fast": {
      className: "Flux_Kontext_Fast",
      returnType: "image"
    },
    "prunaai/p-image-edit": {
      className: "P_Image_Edit",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen/qwen-image-edit-plus": {
      className: "Qwen_Image_Edit_Plus",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "runwayml/gen4-image": {
      className: "Gen4_Image",
      returnType: "image"
    },
    "runwayml/gen4-image-turbo": {
      className: "Gen4_Image_Turbo",
      returnType: "image"
    },
    "zsxkib/ic-light-background": {
      className: "IC_Light_Background",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/step1x-edit": {
      className: "Step1X_Edit",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "fofr/color-matcher": {
      className: "Color_Matcher",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        reference: { propType: "image" }
      }
    },
    "lucataco/controlnet-tile": {
      className: "ControlNet_Tile",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/ip-adapter-faceid": {
      className: "IP_Adapter_FaceID",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        face_image: { propType: "image" }
      }
    },
    "lucataco/ip_adapter-face-inpaint": {
      className: "IP_Adapter_Face_Inpaint",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        face_image: { propType: "image" }
      }
    },
    "lucataco/ip_adapter-sdxl-face": {
      className: "IP_Adapter_SDXL_Face",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        face_image: { propType: "image" }
      }
    },
    "openai/gpt-image-2": {
      className: "GPT_Image_2",
      returnType: "image"
    },
    "google/nano-banana-2": {
      className: "Nano_Banana_2",
      returnType: "image"
    },
    "prunaai/z-image-turbo": {
      className: "Z_Image_Turbo",
      returnType: "image"
    },
    "xai/grok-imagine-image-quality": {
      className: "Grok_Imagine_Image_Quality",
      returnType: "image"
    },
    "black-forest-labs/flux-2-klein-4b-base": {
      className: "Flux_2_Klein_4b_Base",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "black-forest-labs/flux-2-klein-4b-base-lora": {
      className: "Flux_2_Klein_4b_Base_Lora",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "black-forest-labs/flux-2-klein-9b": {
      className: "Flux_2_Klein_9b",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "black-forest-labs/flux-2-klein-9b-base": {
      className: "Flux_2_Klein_9b_Base",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "black-forest-labs/flux-2-klein-9b-base-lora": {
      className: "Flux_2_Klein_9b_Base_Lora",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "bytedance/seedream-5-pro": {
      className: "Seedream_5_Pro",
      returnType: "image",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "google/nano-banana-2-lite": {
      className: "Nano_Banana_2_Lite",
      returnType: "image",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "ideogram-ai/ideogram-v4-balanced": {
      className: "Ideogram_V4_Balanced",
      returnType: "image"
    },
    "ideogram-ai/ideogram-v4-quality": {
      className: "Ideogram_V4_Quality",
      returnType: "image"
    },
    "ideogram-ai/layerize": {
      className: "Layerize",
      returnType: "image",
      fieldOverrides: { flat_graphic_image: { propType: "image" } }
    },
    "krea/krea-2-large": {
      className: "Krea_2_Large",
      returnType: "image",
      fieldOverrides: { style_reference_images: { propType: "list[image]" } }
    },
    "krea/krea-2-medium": {
      className: "Krea_2_Medium",
      returnType: "image",
      fieldOverrides: { style_reference_images: { propType: "list[image]" } }
    },
    "prunaai/p-image-edit-lora": {
      className: "P_Image_Edit_Lora",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "prunaai/p-image-lora": {
      className: "P_Image_Lora",
      returnType: "image"
    },
    "prunaai/p-image-try-on": {
      className: "P_Image_Try_On",
      returnType: "image",
      fieldOverrides: {
        person_image: { propType: "image" },
        garment_images: { propType: "list[image]" },
        reference_pose: { propType: "image" }
      }
    },
    "qwen/qwen-image-2": {
      className: "Qwen_Image_2",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen/qwen-image-2-pro": {
      className: "Qwen_Image_2_Pro",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "alibaba/qwen-image-3": {
      className: "Qwen_Image_3",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "alibaba/qwen-image-3-pro": {
      className: "Qwen_Image_3_Pro",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "recraft-ai/recraft-v4.1": {
      className: "Recraft_V4_1",
      returnType: "image"
    },
    "recraft-ai/recraft-v4.1-pro": {
      className: "Recraft_V4_1_Pro",
      returnType: "image"
    },
    "recraft-ai/recraft-v4.1-pro-svg": {
      className: "Recraft_V4_1_Pro_Svg",
      returnType: "image"
    },
    "recraft-ai/recraft-v4.1-svg": {
      className: "Recraft_V4_1_Svg",
      returnType: "image"
    },
    "recraft-ai/recraft-v4.1-utility": {
      className: "Recraft_V4_1_Utility",
      returnType: "image"
    },
    "recraft-ai/recraft-v4.1-utility-pro": {
      className: "Recraft_V4_1_Utility_Pro",
      returnType: "image"
    },
    "reve/reve-2.1": {
      className: "Reve_2_1",
      returnType: "image",
      fieldOverrides: { reference_images: { propType: "list[image]" } }
    },
    "sourceful/riverflow-2.0-fast": {
      className: "Riverflow_2_0_Fast",
      returnType: "image",
      fieldOverrides: {
        init_images: { propType: "list[image]" },
        super_resolution_refs: { propType: "list[image]" }
      }
    },
    "sourceful/riverflow-2.0-pro": {
      className: "Riverflow_2_0_Pro",
      returnType: "image",
      fieldOverrides: {
        init_images: { propType: "list[image]" },
        super_resolution_refs: { propType: "list[image]" }
      }
    },
    "sourceful/riverflow-v2.5-fast": {
      className: "Riverflow_V2_5_Fast",
      returnType: "image",
      fieldOverrides: { init_images: { propType: "list[image]" } }
    },
    "sourceful/riverflow-v2.5-pro": {
      className: "Riverflow_V2_5_Pro",
      returnType: "image",
      fieldOverrides: { init_images: { propType: "list[image]" } }
    },
    "wan-video/wan-2.7-image": {
      className: "Wan_2_7_Image",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "wan-video/wan-2.7-image-pro": {
      className: "Wan_2_7_Image_Pro",
      returnType: "image",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "aaronaftab/mirage-ghibli": {
      className: "Mirage_Ghibli",
      returnType: "image",
      fieldOverrides: {
        mask: { propType: "image" },
        image: { propType: "image" }
      }
    },
    "anon987654321/ra2": {
      className: "Ra2",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "arthuryeti/dwiss-qwen-2": {
      className: "Dwiss_Qwen_2",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "black-forest-labs/flux-1.1-pro-ultra-finetuned": {
      className: "Flux_1_1_Pro_Ultra_Finetuned",
      returnType: "image",
      fieldOverrides: { image_prompt: { propType: "image" } }
    },
    "black-forest-labs/flux-2-dev": {
      className: "Flux_2_Dev",
      returnType: "image",
      fieldOverrides: { input_images: { propType: "list[image]" } }
    },
    "black-forest-labs/flux-kontext-dev": {
      className: "Flux_Kontext_Dev",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "black-forest-labs/flux-kontext-dev-lora": {
      className: "Flux_Kontext_Dev_Lora",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "black-forest-labs/flux-krea-dev": {
      className: "Flux_Krea_Dev",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "black-forest-labs/flux-pro-finetuned": {
      className: "Flux_Pro_Finetuned",
      returnType: "image",
      fieldOverrides: { image_prompt: { propType: "image" } }
    },
    "bria/product-cutout": {
      className: "Product_Cutout",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/product-packshot": {
      className: "Product_Packshot",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bria/product-shadow": {
      className: "Product_Shadow",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bytedance/bagel": {
      className: "Bagel",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "bytedance/dolphin": {
      className: "Dolphin",
      returnType: "image",
      fieldOverrides: { file: { propType: "image" } }
    },
    "bytedance/dreamina-3.1": {
      className: "Dreamina_3_1",
      returnType: "image"
    },
    "ccchot-osk103/buacat": {
      className: "Buacat",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "ccchot-osk103/happycat": {
      className: "Happycat",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "ccchot-osk103/moneycat": {
      className: "Moneycat",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "ccchot-osk103/pai_qwen_21102568": {
      className: "Pai_Qwen_21102568",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "codingdudecom/flux-kontext-stencil-lora": {
      className: "Flux_Kontext_Stencil_Lora",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "damdam775/portraits_dialogues": {
      className: "Portraits_Dialogues",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/cartoonify": {
      className: "Cartoonify",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/depth-of-field": {
      className: "Depth_Of_Field",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/face-to-many-kontext": {
      className: "Face_To_Many_Kontext",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/filters": {
      className: "Filters",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/iconic-locations": {
      className: "Iconic_Locations",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/impossible-scenarios": {
      className: "Impossible_Scenarios",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/multi-image-kontext-max": {
      className: "Multi_Image_Kontext_Max",
      returnType: "image",
      fieldOverrides: {
        input_image_1: { propType: "image" },
        input_image_2: { propType: "image" }
      }
    },
    "flux-kontext-apps/multi-image-kontext-pro": {
      className: "Multi_Image_Kontext_Pro",
      returnType: "image",
      fieldOverrides: {
        input_image_1: { propType: "image" },
        input_image_2: { propType: "image" }
      }
    },
    "flux-kontext-apps/multi-image-list": {
      className: "Multi_Image_List",
      returnType: "image",
      fieldOverrides: { input_images: { propType: "list[image]" } }
    },
    "flux-kontext-apps/portrait-series": {
      className: "Portrait_Series",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "flux-kontext-apps/text-removal": {
      className: "Text_Removal",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/kontext-0_1-webp": {
      className: "Kontext_0_1_Webp",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/kontext-fix-jpeg-compression": {
      className: "Kontext_Fix_Jpeg_Compression",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/kontext-long-exposure-for-water": {
      className: "Kontext_Long_Exposure_For_Water",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/kontext-make-person-real": {
      className: "Kontext_Make_Person_Real",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/kontext-old-and-damaged": {
      className: "Kontext_Old_And_Damaged",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "fofr/qwen-2004": {
      className: "Qwen_2004",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-bad-70s-food": {
      className: "Qwen_Bad_70s_Food",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-black-sclera": {
      className: "Qwen_Black_Sclera",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-dark-art": {
      className: "Qwen_Dark_Art",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-fantasy-art": {
      className: "Qwen_Fantasy_Art",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-midjourney-v3": {
      className: "Qwen_Midjourney_V3",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-my-subconscious": {
      className: "Qwen_My_Subconscious",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-n74": {
      className: "Qwen_N74",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-tron-ares": {
      className: "Qwen_Tron_Ares",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "fofr/qwen-william-blake": {
      className: "Qwen_William_Blake",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "gaby94500/mamav": {
      className: "Mamav",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "google/gemini-2.5-flash-image": {
      className: "Gemini_2_5_Flash_Image",
      returnType: "image",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "ibm-granite/granite-4.0-h-small": {
      className: "Granite_4_0_H_Small",
      returnType: "image"
    },
    "intelligent-utilities/html-to-image": {
      className: "Html_To_Image",
      returnType: "image"
    },
    "leonardoai/lucid-origin": {
      className: "Lucid_Origin",
      returnType: "image"
    },
    "leonardoai/phoenix-1.0": {
      className: "Phoenix_1_0",
      returnType: "image"
    },
    "lucataco/flux-content-filter": {
      className: "Flux_Content_Filter",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/gpt-oss-safeguard-20b": {
      className: "Gpt_Oss_Safeguard_20b",
      returnType: "image"
    },
    "lucataco/kontext-meta-cars": {
      className: "Kontext_Meta_Cars",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "lucataco/kontext-realearth": {
      className: "Kontext_Realearth",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "lucataco/merge-img": {
      className: "Merge_Img",
      returnType: "image",
      fieldOverrides: {
        background: { propType: "image" },
        foreground: { propType: "image" }
      }
    },
    "lucataco/qwen-davinci": {
      className: "Qwen_Davinci",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "lucataco/vid2webp": {
      className: "Vid2webp",
      returnType: "image",
      fieldOverrides: { video: { propType: "video" } }
    },
    "luma/reframe-image": {
      className: "Reframe_Image",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        image_url: { propType: "image" }
      }
    },
    "maikocode/ascii-style": {
      className: "Ascii_Style",
      returnType: "image",
      fieldOverrides: { input_image: { propType: "image" } }
    },
    "meta/llama-guard-4-12b": {
      className: "Llama_Guard_4_12b",
      returnType: "image",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "moonshotai/kimi-k2-thinking": {
      className: "Kimi_K2_Thinking",
      returnType: "image"
    },
    "nvidia/sana-sprint-1.6b": {
      className: "Sana_Sprint_1_6b",
      returnType: "image"
    },
    "openai/clip": {
      className: "Clip",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "openai/dall-e-2": {
      className: "Dall_E_2",
      returnType: "image"
    },
    "openai/gpt-image-1": {
      className: "Gpt_Image_1",
      returnType: "image",
      fieldOverrides: { input_images: { propType: "list[image]" } }
    },
    "openai/gpt-image-1-mini": {
      className: "Gpt_Image_1_Mini",
      returnType: "image",
      fieldOverrides: { input_images: { propType: "list[image]" } }
    },
    "perceptron-ai-inc/isaac-0.1": {
      className: "Isaac_0_1",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "prunaai/flux-fast": {
      className: "Flux_Fast",
      returnType: "image"
    },
    "prunaai/hidream-l1-dev": {
      className: "Hidream_L1_Dev",
      returnType: "image"
    },
    "prunaai/hidream-l1-fast": {
      className: "Hidream_L1_Fast",
      returnType: "image"
    },
    "prunaai/hidream-l1-full": {
      className: "Hidream_L1_Full",
      returnType: "image"
    },
    "prunaai/p-image": {
      className: "P_Image",
      returnType: "image"
    },
    "prunaai/p-image-trainer": {
      className: "P_Image_Trainer",
      returnType: "image",
      fieldOverrides: { image_data: { propType: "image" } }
    },
    "prunaai/sdxl-lightning": {
      className: "Sdxl_Lightning",
      returnType: "image"
    },
    "prunaai/wan-2.2-image": {
      className: "Wan_2_2_Image",
      returnType: "image"
    },
    "qwen-edit-apps/qwen-image-edit-plus-lora-fusion": {
      className: "Qwen_Image_Edit_Plus_Lora_Fusion",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen-edit-apps/qwen-image-edit-plus-lora-next-scene": {
      className: "Qwen_Image_Edit_Plus_Lora_Next_Scene",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen-edit-apps/qwen-image-edit-plus-lora-photo-to-anime": {
      className: "Qwen_Image_Edit_Plus_Lora_Photo_To_Anime",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen-edit-apps/qwen-image-edit-plus-lora-relight": {
      className: "Qwen_Image_Edit_Plus_Lora_Relight",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen-edit-apps/qwen-image-edit-plus-lora-skin": {
      className: "Qwen_Image_Edit_Plus_Lora_Skin",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen/qwen-edit-multiangle": {
      className: "Qwen_Edit_Multiangle",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen/qwen-image-2512": {
      className: "Qwen_Image_2512",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "qwen/qwen-image-edit-2511": {
      className: "Qwen_Image_Edit_2511",
      returnType: "image",
      fieldOverrides: { image: { propType: "list[image]" } }
    },
    "qwen/qwen-image-edit-plus-lora": {
      className: "Qwen_Image_Edit_Plus_Lora",
      returnType: "image",
      fieldOverrides: { image: { propType: "list[image]" } }
    },
    "qwen/qwen-image-lora-trainer-legacy": {
      className: "Qwen_Image_Lora_Trainer_Legacy",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "recraft-ai/recraft-remove-background": {
      className: "Recraft_Remove_Background",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "recraft-ai/recraft-vectorize": {
      className: "Recraft_Vectorize",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "retro-diffusion/rd-fast": {
      className: "Rd_Fast",
      returnType: "image",
      fieldOverrides: {
        input_image: { propType: "image" },
        input_palette: { propType: "image" }
      }
    },
    "retro-diffusion/rd-plus": {
      className: "Rd_Plus",
      returnType: "image",
      fieldOverrides: {
        input_image: { propType: "image" },
        input_palette: { propType: "image" }
      }
    },
    "retro-diffusion/rd-tile": {
      className: "Rd_Tile",
      returnType: "image",
      fieldOverrides: {
        input_image: { propType: "image" },
        extra_input_image: { propType: "image" }
      }
    },
    "reve/create": {
      className: "Create",
      returnType: "image"
    },
    "reve/edit": {
      className: "Edit",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "reve/edit-fast": {
      className: "Edit_Fast",
      returnType: "image",
      fieldOverrides: { image: { propType: "image" } }
    },
    "reve/remix": {
      className: "Remix",
      returnType: "image",
      fieldOverrides: { reference_images: { propType: "list[image]" } }
    },
    "shridharathi/blueprint-qwen": {
      className: "Blueprint_Qwen",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    },
    "tencent/hunyuan-image-2.1": {
      className: "Hunyuan_Image_2_1",
      returnType: "image"
    },
    "wavespeedai/qwen-image": {
      className: "Wavespeedai_Qwen_Image",
      returnType: "image"
    },
    "wuzoobia/bruna-portrait": {
      className: "Bruna_Portrait",
      returnType: "image",
      fieldOverrides: {
        mask: { propType: "image" },
        image: { propType: "image" }
      }
    },
    "yosun/camcorgi-qwern": {
      className: "Camcorgi_Qwern",
      returnType: "image",
      fieldOverrides: { replicate_weights: { propType: "image" } }
    }
  }
};
