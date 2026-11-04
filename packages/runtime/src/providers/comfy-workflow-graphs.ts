/**
 * Pinned ComfyUI API-format graphs for the open-weights image-to-video models
 * beside Wan 2.2 TI2V 5B. Each was adapted from the matching Comfy workflow
 * template (`video_wan2_2_14B_i2v`, `video_ltx2_3_i2v`, `video_minimax_h3_i2v`) with the subgraph,
 * switches and prompt enhancer flattened into core nodes, and checked against
 * Comfy Cloud's node schemas and model list. The same graphs ship in the
 * editable "Shot Director" example variants.
 */

import type { ComfyApiGraph } from "./comfy-workflow-models.js";

/** Wan 2.2 I2V A14B, high- and low-noise experts with the 4-step lightx2v LoRAs, 16 fps. */
export const WAN22_I2V_A14B_GRAPH: ComfyApiGraph = {
  "84": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "type": "wan",
      "device": "default"
    }
  },
  "89": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
      "clip": [
        "84",
        0
      ]
    }
  },
  "93": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "A cinematic shot.",
      "clip": [
        "84",
        0
      ]
    }
  },
  "90": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "wan_2.1_vae.safetensors"
    }
  },
  "95": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
      "weight_dtype": "default"
    }
  },
  "96": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
      "weight_dtype": "default"
    }
  },
  "101": {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {
      "model": [
        "95",
        0
      ],
      "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
      "strength_model": 1.0
    }
  },
  "102": {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {
      "model": [
        "96",
        0
      ],
      "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
      "strength_model": 1.0
    }
  },
  "104": {
    "class_type": "ModelSamplingSD3",
    "inputs": {
      "model": [
        "101",
        0
      ],
      "shift": 5.0
    }
  },
  "103": {
    "class_type": "ModelSamplingSD3",
    "inputs": {
      "model": [
        "102",
        0
      ],
      "shift": 5.0
    }
  },
  "56": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "input.png"
    }
  },
  "98": {
    "class_type": "WanImageToVideo",
    "inputs": {
      "positive": [
        "93",
        0
      ],
      "negative": [
        "89",
        0
      ],
      "vae": [
        "90",
        0
      ],
      "start_image": [
        "56",
        0
      ],
      "width": 832,
      "height": 480,
      "length": 81,
      "batch_size": 1
    }
  },
  "86": {
    "class_type": "KSamplerAdvanced",
    "inputs": {
      "model": [
        "104",
        0
      ],
      "add_noise": "enable",
      "noise_seed": 42,
      "steps": 4,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "positive": [
        "98",
        0
      ],
      "negative": [
        "98",
        1
      ],
      "latent_image": [
        "98",
        2
      ],
      "start_at_step": 0,
      "end_at_step": 2,
      "return_with_leftover_noise": "enable"
    }
  },
  "85": {
    "class_type": "KSamplerAdvanced",
    "inputs": {
      "model": [
        "103",
        0
      ],
      "add_noise": "disable",
      "noise_seed": 0,
      "steps": 4,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "positive": [
        "98",
        0
      ],
      "negative": [
        "98",
        1
      ],
      "latent_image": [
        "86",
        0
      ],
      "start_at_step": 2,
      "end_at_step": 10000,
      "return_with_leftover_noise": "disable"
    }
  },
  "87": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [
        "85",
        0
      ],
      "vae": [
        "90",
        0
      ]
    }
  },
  "57": {
    "class_type": "CreateVideo",
    "inputs": {
      "fps": 16,
      "images": [
        "87",
        0
      ]
    }
  },
  "58": {
    "class_type": "SaveVideo",
    "inputs": {
      "filename_prefix": "video/nodetool-wan22-14b",
      "format": "auto",
      "codec": "auto",
      "video": [
        "57",
        0
      ]
    }
  }
};

/** LTX-2.3 22B image-to-video with audio: half-size pass, x2 latent upscale, refine pass, 24 fps. */
export const LTX23_I2V_GRAPH: ComfyApiGraph = {
  "1": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors"
    }
  },
  "2": {
    "class_type": "LTXAVTextEncoderLoader",
    "inputs": {
      "text_encoder": "gemma_3_12B_it_fp4_mixed.safetensors",
      "ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors",
      "device": "default"
    }
  },
  "3": {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {
      "model": [
        "1",
        0
      ],
      "lora_name": "ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors",
      "strength_model": 0.5
    }
  },
  "4": {
    "class_type": "LTXVAudioVAELoader",
    "inputs": {
      "ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors"
    }
  },
  "5": {
    "class_type": "LatentUpscaleModelLoader",
    "inputs": {
      "model_name": "ltx-2.3-spatial-upscaler-x2-1.1.safetensors"
    }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "A cinematic shot.",
      "clip": [
        "2",
        0
      ]
    }
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "pc game, console game, video game, cartoon, childish, ugly",
      "clip": [
        "2",
        0
      ]
    }
  },
  "8": {
    "class_type": "LTXVConditioning",
    "inputs": {
      "positive": [
        "6",
        0
      ],
      "negative": [
        "7",
        0
      ],
      "frame_rate": 24
    }
  },
  "56": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "input.png"
    }
  },
  "10": {
    "class_type": "ImageScale",
    "inputs": {
      "image": [
        "56",
        0
      ],
      "upscale_method": "lanczos",
      "width": 1280,
      "height": 704,
      "crop": "center"
    }
  },
  "11": {
    "class_type": "LTXVPreprocess",
    "inputs": {
      "image": [
        "10",
        0
      ],
      "img_compression": 18
    }
  },
  "12": {
    "class_type": "EmptyLTXVLatentVideo",
    "inputs": {
      "width": 640,
      "height": 352,
      "length": 121,
      "batch_size": 1
    }
  },
  "13": {
    "class_type": "LTXVImgToVideoInplace",
    "inputs": {
      "vae": [
        "1",
        2
      ],
      "image": [
        "11",
        0
      ],
      "latent": [
        "12",
        0
      ],
      "strength": 0.7,
      "bypass": false
    }
  },
  "14": {
    "class_type": "LTXVEmptyLatentAudio",
    "inputs": {
      "audio_vae": [
        "4",
        0
      ],
      "frames_number": 121,
      "frame_rate": 24,
      "batch_size": 1
    }
  },
  "15": {
    "class_type": "LTXVConcatAVLatent",
    "inputs": {
      "video_latent": [
        "13",
        0
      ],
      "audio_latent": [
        "14",
        0
      ]
    }
  },
  "16": {
    "class_type": "RandomNoise",
    "inputs": {
      "noise_seed": 42
    }
  },
  "17": {
    "class_type": "CFGGuider",
    "inputs": {
      "model": [
        "3",
        0
      ],
      "positive": [
        "8",
        0
      ],
      "negative": [
        "8",
        1
      ],
      "cfg": 1
    }
  },
  "18": {
    "class_type": "KSamplerSelect",
    "inputs": {
      "sampler_name": "euler"
    }
  },
  "19": {
    "class_type": "ManualSigmas",
    "inputs": {
      "sigmas": "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"
    }
  },
  "20": {
    "class_type": "SamplerCustomAdvanced",
    "inputs": {
      "noise": [
        "16",
        0
      ],
      "guider": [
        "17",
        0
      ],
      "sampler": [
        "18",
        0
      ],
      "sigmas": [
        "19",
        0
      ],
      "latent_image": [
        "15",
        0
      ]
    }
  },
  "21": {
    "class_type": "LTXVSeparateAVLatent",
    "inputs": {
      "av_latent": [
        "20",
        0
      ]
    }
  },
  "22": {
    "class_type": "LTXVCropGuides",
    "inputs": {
      "positive": [
        "8",
        0
      ],
      "negative": [
        "8",
        1
      ],
      "latent": [
        "21",
        0
      ]
    }
  },
  "23": {
    "class_type": "LTXVLatentUpsampler",
    "inputs": {
      "samples": [
        "21",
        0
      ],
      "upscale_model": [
        "5",
        0
      ],
      "vae": [
        "1",
        2
      ]
    }
  },
  "24": {
    "class_type": "LTXVImgToVideoInplace",
    "inputs": {
      "vae": [
        "1",
        2
      ],
      "image": [
        "11",
        0
      ],
      "latent": [
        "23",
        0
      ],
      "strength": 1.0,
      "bypass": false
    }
  },
  "25": {
    "class_type": "LTXVConcatAVLatent",
    "inputs": {
      "video_latent": [
        "24",
        0
      ],
      "audio_latent": [
        "21",
        1
      ]
    }
  },
  "26": {
    "class_type": "RandomNoise",
    "inputs": {
      "noise_seed": 42
    }
  },
  "27": {
    "class_type": "CFGGuider",
    "inputs": {
      "model": [
        "3",
        0
      ],
      "positive": [
        "22",
        0
      ],
      "negative": [
        "22",
        1
      ],
      "cfg": 1
    }
  },
  "28": {
    "class_type": "KSamplerSelect",
    "inputs": {
      "sampler_name": "euler"
    }
  },
  "29": {
    "class_type": "ManualSigmas",
    "inputs": {
      "sigmas": "0.85, 0.7250, 0.4219, 0.0"
    }
  },
  "30": {
    "class_type": "SamplerCustomAdvanced",
    "inputs": {
      "noise": [
        "26",
        0
      ],
      "guider": [
        "27",
        0
      ],
      "sampler": [
        "28",
        0
      ],
      "sigmas": [
        "29",
        0
      ],
      "latent_image": [
        "25",
        0
      ]
    }
  },
  "31": {
    "class_type": "LTXVSeparateAVLatent",
    "inputs": {
      "av_latent": [
        "30",
        0
      ]
    }
  },
  "32": {
    "class_type": "VAEDecodeTiled",
    "inputs": {
      "samples": [
        "31",
        0
      ],
      "vae": [
        "1",
        2
      ],
      "tile_size": 768,
      "overlap": 64,
      "temporal_size": 4096,
      "temporal_overlap": 4
    }
  },
  "33": {
    "class_type": "LTXVAudioVAEDecode",
    "inputs": {
      "samples": [
        "31",
        1
      ],
      "audio_vae": [
        "4",
        0
      ]
    }
  },
  "57": {
    "class_type": "CreateVideo",
    "inputs": {
      "images": [
        "32",
        0
      ],
      "audio": [
        "33",
        0
      ],
      "fps": 24
    }
  },
  "58": {
    "class_type": "SaveVideo",
    "inputs": {
      "filename_prefix": "video/nodetool-ltx23",
      "format": "auto",
      "codec": "auto",
      "video": [
        "57",
        0
      ]
    }
  }
};

/**
 * MiniMax H3 image-to-video with audio, the 8-step turbo LoRA at 6 steps,
 * 24 fps. The MiniMax H3 Community License excludes the EU, the UK, the US and
 * South Korea, so the provider lists this model only when it is enabled.
 */
export const MINIMAX_H3_I2V_GRAPH: ComfyApiGraph = {
  "6": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "weight_dtype": "default"
    }
  },
  "121": {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {
      "model": [
        "6",
        0
      ],
      "lora_name": "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
      "strength_model": 1.0
    }
  },
  "13": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "type": "minimax",
      "device": "default"
    }
  },
  "11": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "minimax_h3_video_vae_fp16.safetensors"
    }
  },
  "24": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
    }
  },
  "56": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "input.png"
    }
  },
  "104": {
    "class_type": "MiniMaxH3ImageToVideo",
    "inputs": {
      "clip": [
        "13",
        0
      ],
      "vae": [
        "11",
        0
      ],
      "prompt": "A cinematic shot.",
      "width": 864,
      "height": 480,
      "length": 124,
      "first_frame": [
        "56",
        0
      ]
    }
  },
  "15": {
    "class_type": "RandomNoise",
    "inputs": {
      "noise_seed": 42
    }
  },
  "17": {
    "class_type": "KSamplerSelect",
    "inputs": {
      "sampler_name": "res_multistep"
    }
  },
  "9": {
    "class_type": "BasicScheduler",
    "inputs": {
      "model": [
        "121",
        0
      ],
      "scheduler": "simple",
      "steps": 6,
      "denoise": 1.0
    }
  },
  "16": {
    "class_type": "BasicGuider",
    "inputs": {
      "model": [
        "121",
        0
      ],
      "conditioning": [
        "104",
        0
      ]
    }
  },
  "14": {
    "class_type": "SamplerCustomAdvanced",
    "inputs": {
      "noise": [
        "15",
        0
      ],
      "guider": [
        "16",
        0
      ],
      "sampler": [
        "17",
        0
      ],
      "sigmas": [
        "9",
        0
      ],
      "latent_image": [
        "104",
        1
      ]
    }
  },
  "10": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [
        "14",
        0
      ],
      "vae": [
        "11",
        0
      ]
    }
  },
  "23": {
    "class_type": "VAEDecodeAudio",
    "inputs": {
      "samples": [
        "14",
        0
      ],
      "vae": [
        "24",
        0
      ]
    }
  },
  "57": {
    "class_type": "CreateVideo",
    "inputs": {
      "images": [
        "10",
        0
      ],
      "audio": [
        "23",
        0
      ],
      "fps": 24
    }
  },
  "58": {
    "class_type": "SaveVideo",
    "inputs": {
      "filename_prefix": "video/nodetool-minimax-h3",
      "format": "auto",
      "codec": "auto",
      "video": [
        "57",
        0
      ]
    }
  }
};
