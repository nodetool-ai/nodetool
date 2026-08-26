import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/z-image-base-trainer": {
      className: "ZImageBaseTrainer",
      docstring: "Z-Image Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/z-image-turbo-trainer-v2": {
      className: "ZImageTurboTrainerV2",
      docstring: "Z Image Turbo Trainer V2",
      tags: ["training", "fine-tuning", "lora", "model-training", "fast"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-klein-9b-base-trainer/edit": {
      className: "Flux2Klein9BBaseTrainerEdit",
      docstring: "Flux 2 Klein 9B Base Trainer",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-klein-9b-base-trainer": {
      className: "Flux2Klein9BBaseTrainer",
      docstring: "Flux 2 Klein 9B Base Trainer",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-klein-4b-base-trainer": {
      className: "Flux2Klein4BBaseTrainer",
      docstring: "Flux 2 Klein 4B Base Trainer",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-klein-4b-base-trainer/edit": {
      className: "Flux2Klein4BBaseTrainerEdit",
      docstring: "Flux 2 Klein 4B Base Trainer",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-2512-trainer-v2": {
      className: "QwenImage2512TrainerV2",
      docstring: "Qwen Image 2512 Trainer V2",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-trainer-v2/edit": {
      className: "Flux2TrainerV2Edit",
      docstring: "Flux 2 Trainer V2",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/flux-2-trainer-v2": {
      className: "Flux2TrainerV2",
      docstring: "Flux 2 Trainer V2",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx2-video-trainer": {
      className: "Ltx2VideoTrainer",
      docstring: "LTX-2 Video Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-2512-trainer": {
      className: "QwenImage2512Trainer",
      docstring: "Qwen Image 2512 Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-edit-2511-trainer": {
      className: "QwenImageEdit2511Trainer",
      docstring: "Qwen Image Edit 2511 Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-layered-trainer": {
      className: "QwenImageLayeredTrainer",
      docstring: "Qwen Image Layered Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/qwen-image-edit-2509-trainer": {
      className: "QwenImageEdit2509Trainer",
      docstring: "Qwen Image Edit 2509 Trainer",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/z-image-trainer": {
      className: "ZImageTrainer",
      docstring:
        "Train LoRAs on Z-Image Turbo, a super fast text-to-image model of 6B parameters developed by Tongyi-MAI.",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/flux-2-trainer/edit": {
      className: "Flux2TrainerEdit",
      docstring:
        "Fine-tune FLUX.2 [dev] from Black Forest Labs with custom datasets. Create specialized LoRA adaptations for specific editing tasks.",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/flux-2-trainer": {
      className: "Flux2Trainer",
      docstring:
        "Fine-tune FLUX.2 [dev] from Black Forest Labs with custom datasets. Create specialized LoRA adaptations for specific styles and domains.",
      tags: ["flux", "training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/qwen-image-edit-plus-trainer": {
      className: "QwenImageEditPlusTrainer",
      docstring: "LoRA trainer for Qwen Image Edit Plus",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/qwen-image-edit-trainer": {
      className: "QwenImageEditTrainer",
      docstring: "LoRA trainer for Qwen Image Edit",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/qwen-image-trainer": {
      className: "QwenImageTrainer",
      docstring: "Qwen Image LoRA training",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-22-image-trainer": {
      className: "Wan22ImageTrainer",
      docstring:
        "Wan 2.2 text to image LoRA trainer. Fine-tune Wan 2.2 for subjects and styles with unprecedented detail.",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-trainer/t2v": {
      className: "WanTrainerT2v",
      docstring: "Train custom LoRAs for Wan-2.1 T2V 1.3B",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-trainer/t2v-14b": {
      className: "WanTrainerT2v14b",
      docstring: "Train custom LoRAs for Wan-2.1 T2V 14B",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-trainer/i2v-720p": {
      className: "WanTrainerI2v720p",
      docstring: "Train custom LoRAs for Wan-2.1 I2V 720P",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-trainer/flf2v-720p": {
      className: "WanTrainerFlf2v720p",
      docstring: "Train custom LoRAs for Wan-2.1 FLF2V 720P",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/ltx-video-trainer": {
      className: "LtxVideoTrainer",
      docstring: "Train LTX Video 0.9.7 for custom styles and effects.",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/recraft/v3/create-style": {
      className: "RecraftV3CreateStyle",
      docstring:
        "Recraft V3 Create Style is capable of creating unique styles for Recraft V3 based on your images.",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/turbo-flux-trainer": {
      className: "TurboFluxTrainer",
      docstring:
        "A blazing fast FLUX dev LoRA trainer for subjects and styles.",
      tags: [
        "flux",
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "fast"
      ],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/wan-trainer": {
      className: "WanTrainer",
      docstring: "Train custom LoRAs for Wan-2.1 I2V 480P",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/hunyuan-video-lora-training": {
      className: "HunyuanVideoLoraTraining",
      docstring:
        "Train Hunyuan Video lora on people, objects, characters and more!",
      tags: ["training", "fine-tuning", "lora", "model-training"],
      useCases: [
        "Custom model fine-tuning",
        "LoRA training for personalization",
        "Style-specific model training",
        "Brand-specific image generation",
        "Specialized domain adaptation"
      ]
    },
    "fal-ai/ideogram/custom-models": {
      className: "IdeogramCustomModels",
      docstring: "Train a custom Ideogram model.",
      tags: ["training", "fine-tuning", "ideogram", "custom-model"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ernie-image-trainer": {
      className: "ErnieImageTrainer",
      docstring: "Train a LoRA for ERNIE Image.",
      tags: ["training", "fine-tuning", "ernie", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "minimax/h3/t2v/trainer": {
      className: "MinimaxH3T2vTrainer",
      docstring:
        "Trains a MiniMax H3 LoRA on captioned clips for text-to-video generation with matching audio.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "minimax",
        "h3",
        "video"
      ],
      useCases: [
        "Teach H3 a custom visual style",
        "Train a recurring character",
        "Learn a studio's motion language",
        "Adapt H3 to a product catalog",
        "Fine-tune for a series look"
      ]
    },

    "minimax/h3/i2v/trainer": {
      className: "MinimaxH3I2vTrainer",
      docstring:
        "Trains a MiniMax H3 LoRA with first-frame conditioning, so a still animates into video with audio.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "minimax",
        "h3",
        "image-to-video"
      ],
      useCases: [
        "Train an animation style for stills",
        "Teach H3 how a subject moves",
        "Fine-tune product photo animation",
        "Learn a character's motion from clips",
        "Adapt first-frame animation to a brand"
      ]
    },

    "minimax/h3/flf2v/trainer": {
      className: "MinimaxH3Flf2vTrainer",
      docstring:
        "Trains a MiniMax H3 LoRA on first, last, or both keyframes to generate video with audio between them.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "minimax",
        "h3",
        "keyframes"
      ],
      useCases: [
        "Train keyframe-to-keyframe motion",
        "Teach transitions between two stills",
        "Fine-tune in-between generation",
        "Learn a studio's transition style",
        "Adapt H3 to storyboard keyframes"
      ]
    },

    "minimax/h3/ref2va/trainer": {
      className: "MinimaxH3Ref2vaTrainer",
      docstring:
        "Trains a MiniMax H3 LoRA with reference conditioning, so references animate into video with audio.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "minimax",
        "h3",
        "reference"
      ],
      useCases: [
        "Train reference-driven video generation",
        "Teach H3 a reusable cast",
        "Fine-tune multimodal conditioning",
        "Learn a look from reference material",
        "Adapt reference control to a franchise"
      ]
    },

    "recraft/v4/create-style": {
      className: "RecraftV4CreateStyle",
      docstring:
        "Creates a reusable Recraft V4 style from reference images and returns a style id for generation.",
      tags: ["training", "style", "recraft", "recraft-v4"],
      useCases: [
        "Capture a brand style from references",
        "Reuse one look across many images",
        "Share a style id across a team",
        "Build a style library",
        "Lock art direction before generation"
      ]
    },

    "recraft/v4/pro/create-style": {
      className: "RecraftV4ProCreateStyle",
      docstring:
        "Creates a reusable Recraft V4 Pro style from reference images and returns a style id for Pro generation.",
      tags: ["training", "style", "recraft", "recraft-v4", "pro"],
      useCases: [
        "Capture a style for Pro generation",
        "Standardize art direction at higher quality",
        "Build a reusable brand style",
        "Share one style across campaigns",
        "Version a studio look"
      ]
    },

    "fal-ai/krea-2-trainer": {
      className: "Krea2Trainer",
      docstring:
        "Trains a Krea 2 LoRA on your images to teach a new subject, character, or style.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "krea",
        "krea-2",
        "image"
      ],
      useCases: [
        "Teach Krea 2 a product or character",
        "Train a house illustration style",
        "Fine-tune on a photo set",
        "Produce weights for the Krea 2 LoRA endpoint",
        "Personalize generation with a trigger word"
      ]
    },

    "fal-ai/stable-audio-3-trainer": {
      className: "StableAudio3Trainer",
      docstring:
        "Trains a Stable Audio 3 LoRA on paired audio and captions to adapt generation to a style or sound palette.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "audio",
        "music",
        "sfx",
        "stable-audio"
      ],
      useCases: [
        "Adapt Stable Audio 3 to a genre",
        "Train a custom sound palette",
        "Fine-tune on a sample library",
        "Teach a signature instrument set",
        "Produce weights for branded audio"
      ]
    },

    "fal-ai/trellis-2-lora-trainer": {
      className: "Trellis2LoraTrainer",
      docstring: "Trains LoRA adapters for TRELLIS.2 3D generation.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "trellis",
        "3d"
      ],
      useCases: [
        "Teach TRELLIS.2 a custom asset style",
        "Fine-tune 3D generation on a catalog",
        "Train a recurring 3D character",
        "Adapt geometry style to a game",
        "Produce weights for TRELLIS.2 inference"
      ]
    },

    "ideogram/v4/trainer": {
      className: "IdeogramV4Trainer",
      docstring:
        "Trains custom LoRAs on top of Ideogram V4 for personalization and styles.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ideogram",
        "ideogram-v4",
        "image"
      ],
      useCases: [
        "Personalize Ideogram V4 on a subject",
        "Train a brand illustration style",
        "Fine-tune typography treatments",
        "Teach a recurring character",
        "Produce weights for Ideogram LoRA endpoints"
      ]
    },

    "fal-ai/phota/create-profile": {
      className: "PhotaCreateProfile",
      docstring:
        "Creates a Phota profile from 30 to 50 images of a subject for later generation.",
      tags: ["training", "personalization", "profile", "phota", "portrait"],
      useCases: [
        "Build a personal photo profile",
        "Train a portrait identity",
        "Prepare a subject for headshot generation",
        "Create a reusable likeness profile",
        "Register a model for a photo product"
      ]
    },

    "fal-ai/wan-22-trainer/t2v-a14b": {
      className: "Wan22TrainerT2vA14b",
      docstring: "Trains a custom LoRA for Wan 2.2 T2V A14B at 480p.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "wan",
        "wan-2-2",
        "text-to-video"
      ],
      useCases: [
        "Teach Wan 2.2 a text-to-video style",
        "Train a recurring character for video",
        "Fine-tune motion on your clips",
        "Adapt Wan 2.2 to a brand look",
        "Produce weights for Wan 2.2 inference"
      ]
    },

    "fal-ai/wan-22-trainer/i2v-a14b": {
      className: "Wan22TrainerI2vA14b",
      docstring: "Trains a custom LoRA for Wan 2.2 I2V A14B at 480p.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "wan",
        "wan-2-2",
        "image-to-video"
      ],
      useCases: [
        "Teach Wan 2.2 how a subject animates",
        "Train image-to-video motion on your clips",
        "Fine-tune product photo animation",
        "Adapt animation style to a brand",
        "Produce weights for Wan 2.2 I2V"
      ]
    },

    "fal-ai/ltx23-video-trainer": {
      className: "Ltx23VideoTrainer",
      docstring: "Trains LTX-2.3 22B for custom styles and effects.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "video"
      ],
      useCases: [
        "Teach LTX 2.3 a visual style",
        "Train a recurring effect",
        "Fine-tune on studio footage",
        "Adapt LTX to a brand look",
        "Produce weights for LTX inference"
      ]
    },

    "fal-ai/ltx23-v2v-trainer": {
      className: "Ltx23V2vTrainer",
      docstring:
        "Trains LTX-2.3 22B for video transformation and video-conditioned generation.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "video-to-video"
      ],
      useCases: [
        "Train a video-to-video transformation",
        "Teach a restyle from paired clips",
        "Fine-tune video-conditioned generation",
        "Learn an effect from before/after footage",
        "Produce weights for LTX v2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/t2v": {
      className: "Ltx23TrainerV2T2v",
      docstring:
        "Trains an LTX 2.3 LoRA on your clips for text-to-video generation.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "text-to-video"
      ],
      useCases: [
        "Teach LTX a new subject or style",
        "Train a recurring character",
        "Fine-tune on studio footage",
        "Adapt text-to-video to a brand",
        "Produce weights for LTX inference"
      ]
    },

    "fal-ai/ltx23-trainer-v2/i2v": {
      className: "Ltx23TrainerV2I2v",
      docstring:
        "Trains an LTX 2.3 LoRA that animates a starting image into video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "image-to-video"
      ],
      useCases: [
        "Train how a still should animate",
        "Teach a subject's motion from clips",
        "Fine-tune product photo animation",
        "Adapt first-frame animation to a brand",
        "Produce weights for LTX i2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/v2v": {
      className: "Ltx23TrainerV2V2v",
      docstring:
        "Trains an LTX 2.3 LoRA for a video-to-video transformation steered by a reference video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "video-to-video"
      ],
      useCases: [
        "Learn a restyle from paired clips",
        "Train a reference-steered transformation",
        "Teach a look transfer for footage",
        "Fine-tune an effect on before/after pairs",
        "Produce weights for LTX v2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/v2v-masked": {
      className: "Ltx23TrainerV2V2vMasked",
      docstring:
        "Trains an LTX 2.3 LoRA that regenerates only a masked video region, guided by kept pixels and a reference video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "video-to-video",
        "inpainting",
        "mask"
      ],
      useCases: [
        "Train targeted region replacement",
        "Teach masked restyling of footage",
        "Fine-tune object swaps in video",
        "Learn a mask-aware transformation",
        "Produce weights for masked v2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/inpaint": {
      className: "Ltx23TrainerV2Inpaint",
      docstring:
        "Trains an LTX 2.3 LoRA that regenerates a masked video region while keeping the rest unchanged.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "inpainting",
        "mask"
      ],
      useCases: [
        "Train video object removal",
        "Teach masked region regeneration",
        "Fine-tune cleanup of unwanted elements",
        "Learn seamless blending with surroundings",
        "Produce weights for video inpainting"
      ]
    },

    "fal-ai/ltx23-trainer-v2/outpaint": {
      className: "Ltx23TrainerV2Outpaint",
      docstring:
        "Trains an LTX 2.3 LoRA that expands the video frame outward from a fixed inner rectangle.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "outpainting"
      ],
      useCases: [
        "Train aspect-ratio expansion",
        "Teach frame extension for reframing",
        "Fine-tune outward generation",
        "Convert vertical footage to wide",
        "Produce weights for video outpainting"
      ]
    },

    "fal-ai/ltx23-trainer-v2/interpolate": {
      className: "Ltx23TrainerV2Interpolate",
      docstring:
        "Trains an LTX 2.3 LoRA that generates the video between supplied keyframes.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "keyframes",
        "interpolation"
      ],
      useCases: [
        "Train keyframe in-betweening",
        "Teach transitions between stills",
        "Fine-tune motion between frames",
        "Learn a studio's transition style",
        "Produce weights for keyframe interpolation"
      ]
    },

    "fal-ai/ltx23-trainer-v2/extend-prefix": {
      className: "Ltx23TrainerV2ExtendPrefix",
      docstring:
        "Trains an LTX 2.3 LoRA that continues a video forward in time from an opening clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "extension"
      ],
      useCases: [
        "Train forward video continuation",
        "Teach what follows an opening shot",
        "Fine-tune clip extension",
        "Learn a scene's continuation style",
        "Produce weights for forward extension"
      ]
    },

    "fal-ai/ltx23-trainer-v2/extend-suffix": {
      className: "Ltx23TrainerV2ExtendSuffix",
      docstring:
        "Trains an LTX 2.3 LoRA that generates the lead-in to a video, extending it backward in time.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "extension"
      ],
      useCases: [
        "Train backward video extension",
        "Generate a lead-in to an existing clip",
        "Fine-tune prefix generation",
        "Learn how a shot should begin",
        "Produce weights for backward extension"
      ]
    },

    "fal-ai/ltx23-trainer-v2/a2v": {
      className: "Ltx23TrainerV2A2v",
      docstring:
        "Trains an LTX 2.3 LoRA that generates video from a start image and a conditioning audio track.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio-to-video"
      ],
      useCases: [
        "Train audio-driven animation",
        "Teach motion that matches sound",
        "Fine-tune music-timed video",
        "Learn lip and beat synchronization",
        "Produce weights for audio-to-video"
      ]
    },

    "fal-ai/ltx23-trainer-v2/v2a": {
      className: "Ltx23TrainerV2V2a",
      docstring:
        "Trains an LTX 2.3 LoRA that generates foley and sound design for silent video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "video-to-audio",
        "foley"
      ],
      useCases: [
        "Train foley generation for footage",
        "Teach a sound palette for scenes",
        "Fine-tune soundtrack generation",
        "Learn effects that match on-screen action",
        "Produce weights for video-to-audio"
      ]
    },

    "fal-ai/ltx23-trainer-v2/t2a": {
      className: "Ltx23TrainerV2T2a",
      docstring:
        "Trains an LTX 2.3 LoRA that generates audio from a text prompt.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "text-to-audio"
      ],
      useCases: [
        "Train text-to-audio on your clips",
        "Teach a signature sound",
        "Fine-tune a sound-effect library",
        "Learn a musical style from samples",
        "Produce weights for text-to-audio"
      ]
    },

    "fal-ai/ltx23-trainer-v2/a2a": {
      className: "Ltx23TrainerV2A2a",
      docstring:
        "Trains an LTX 2.3 LoRA that maps one audio clip to another from paired examples.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio-to-audio"
      ],
      useCases: [
        "Train an audio transformation",
        "Teach a timbre or style transfer",
        "Fine-tune on paired audio",
        "Learn a mastering signature",
        "Produce weights for audio-to-audio"
      ]
    },

    "fal-ai/ltx23-trainer-v2/audio-inpaint": {
      className: "Ltx23TrainerV2AudioInpaint",
      docstring:
        "Trains an LTX 2.3 LoRA that regenerates masked time spans of an audio clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio",
        "inpainting",
        "mask"
      ],
      useCases: [
        "Train audio gap repair",
        "Teach removal of unwanted sounds",
        "Fine-tune masked audio regeneration",
        "Learn seamless audio patching",
        "Produce weights for audio inpainting"
      ]
    },

    "fal-ai/ltx23-trainer-v2/audio-extend-prefix": {
      className: "Ltx23TrainerV2AudioExtendPrefix",
      docstring:
        "Trains an LTX 2.3 LoRA that continues an audio clip forward in time.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio",
        "extension"
      ],
      useCases: [
        "Train forward audio continuation",
        "Extend a track past its ending",
        "Fine-tune audio outros",
        "Learn how a piece should continue",
        "Produce weights for audio extension"
      ]
    },

    "fal-ai/ltx23-trainer-v2/audio-extend-suffix": {
      className: "Ltx23TrainerV2AudioExtendSuffix",
      docstring:
        "Trains an LTX 2.3 LoRA that generates the lead-in to an audio clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio",
        "extension"
      ],
      useCases: [
        "Train backward audio extension",
        "Generate an intro for a track",
        "Fine-tune audio lead-ins",
        "Learn how a piece should begin",
        "Produce weights for audio prefix generation"
      ]
    },

    "fal-ai/ltx23-trainer-v2/av2av": {
      className: "Ltx23TrainerV2Av2av",
      docstring:
        "Trains an LTX 2.3 LoRA for a joint audio and video transformation conditioned on a reference clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio",
        "video-to-video",
        "reference"
      ],
      useCases: [
        "Train joint audio-video restyling",
        "Teach a reference-conditioned transform",
        "Fine-tune paired sound and picture",
        "Learn a full-clip transformation",
        "Produce weights for av2av"
      ]
    },

    "fal-ai/ltx23-trainer-v2/av2av-masked": {
      className: "Ltx23TrainerV2Av2avMasked",
      docstring:
        "Trains an LTX 2.3 LoRA that regenerates a masked video region while generating audio from a reference.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "audio",
        "inpainting",
        "mask",
        "reference"
      ],
      useCases: [
        "Train masked audio-video regeneration",
        "Teach region replacement with sound",
        "Fine-tune masked multimodal edits",
        "Learn reference-guided repair",
        "Produce weights for masked av2av"
      ]
    },

    "fal-ai/ltx23-trainer-v2/ic-lora/v2v": {
      className: "Ltx23TrainerV2IcLoraV2v",
      docstring:
        "Trains an LTX 2.3 IC-LoRA for a video-to-video transformation conditioned on a control video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "ic-lora",
        "video-to-video"
      ],
      useCases: [
        "Train an in-context video transform",
        "Teach control-video conditioning",
        "Fine-tune from paired clips",
        "Learn a restyle steered at inference",
        "Produce IC-LoRA weights for v2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/ic-lora/v2v-masked": {
      className: "Ltx23TrainerV2IcLoraV2vMasked",
      docstring:
        "Trains an LTX 2.3 IC-LoRA that regenerates a masked video region guided by kept pixels and a control video.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "ic-lora",
        "video-to-video",
        "mask"
      ],
      useCases: [
        "Train masked in-context transforms",
        "Teach reference-guided region edits",
        "Fine-tune object replacement",
        "Learn mask-aware conditioning",
        "Produce IC-LoRA weights for masked v2v"
      ]
    },

    "fal-ai/ltx23-trainer-v2/ic-lora/a2a": {
      className: "Ltx23TrainerV2IcLoraA2a",
      docstring:
        "Trains an LTX 2.3 IC-LoRA that transforms audio conditioned on a reference clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "ic-lora",
        "audio-to-audio"
      ],
      useCases: [
        "Train in-context audio transforms",
        "Teach reference-driven timbre transfer",
        "Fine-tune on paired audio",
        "Learn a style steered at inference",
        "Produce IC-LoRA weights for a2a"
      ]
    },

    "fal-ai/ltx23-trainer-v2/ic-lora/av2av": {
      className: "Ltx23TrainerV2IcLoraAv2av",
      docstring:
        "Trains an LTX 2.3 IC-LoRA for a joint audio and video transformation from a reference clip.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "ic-lora",
        "audio",
        "video-to-video"
      ],
      useCases: [
        "Train in-context audio-video transforms",
        "Teach reference-conditioned restyling",
        "Fine-tune sound and picture together",
        "Learn a full-clip mapping",
        "Produce IC-LoRA weights for av2av"
      ]
    },

    "fal-ai/ltx23-trainer-v2/ic-lora/av2av-masked": {
      className: "Ltx23TrainerV2IcLoraAv2avMasked",
      docstring:
        "Trains an LTX 2.3 IC-LoRA that regenerates a masked video region while generating audio from a reference.",
      tags: [
        "training",
        "fine-tuning",
        "lora",
        "model-training",
        "ltx",
        "ltx-2-3",
        "ic-lora",
        "audio",
        "mask",
        "inpainting"
      ],
      useCases: [
        "Train masked in-context multimodal edits",
        "Teach guided region repair with sound",
        "Fine-tune reference-driven inpainting",
        "Learn mask-aware av conditioning",
        "Produce IC-LoRA weights for masked av2av"
      ]
    }
  }
};
