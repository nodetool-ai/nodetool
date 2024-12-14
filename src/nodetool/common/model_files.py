import os


checkpoints = [
    {
        "url": "https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors",
        "file": "Realistic_Vision_V5.safetensors",
    },
    {
        "url": "https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_6.31_BakedVae_pruned.safetensors",
        "file": "dreamshaper-v6.safetensors",
    },
    {
        "url": "https://huggingface.co/digiplay/majicMIX_realistic_v6/resolve/main/majicmixRealistic_v6.safetensors?download=true",
        "file": "majicmixRealistic_v6.ckpt",
    },
    {
        "url": "https://huggingface.co/Yntec/RealCartoon3D/resolve/main/realcartoon3d_v10.safetensors",
        "file": "realcartoon3d_v10.safetensors",
    },
    {
        "url": "https://huggingface.co/Yntec/epiCPhotoGasm/resolve/main/epiCPhotoGasm.safetensors",
        "file": "epiCPhotoGasm.safetensors",
    },
    {
        "url": "https://huggingface.co/Yntec/epiCRealismVAE/resolve/main/epiCRealismVAE.safetensors",
        "file": "epiCRealism.safetensors",
    },
    {
        "url": "https://huggingface.co/digiplay/Photon_v1/resolve/main/photon_v1.safetensors",
        "file": "photon_v1.safetensors",
    },
    {
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
        "file": "sd_xl_base_1.0.safetensors",
    },
    {
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
        "file": "sd_xl_refiner_1.0.safetensors",
    },
    {
        "url": "https://huggingface.co/frankjoshua/juggernautXL_version6Rundiffusion/resolve/main/juggernautXL_version6Rundiffusion.safetensors",
        "file": "juggernaut-xl-v6.safetensors",
    },
    {
        "url": "https://huggingface.co/playgroundai/playground-v2-1024px-aesthetic/resolve/main/playground-v2.fp16.safetensors",
        "file": "playground-v2.safetensors",
    },
    {
        "url": "https://huggingface.co/frankjoshua/realcartoonXL_v4/resolve/main/realcartoonXL_v4.safetensors",
        "file": "realcartoonXL_v4.safetensors",
    },
    {
        "url": "https://huggingface.co/Linaqruf/animagine-xl-2.0/resolve/main/animagine-xl-2.0.safetensors",
        "file": "animagine-xl-2.0.safetensors",
    },
]

controlnet = [
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11e_sd15_ip2p_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11e_sd15_shuffle_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11f1e_sd15_tile_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11f1p_sd15_depth_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_canny_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_inpaint_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_lineart_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_normalbae_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_openpose_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_scribble_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_seg_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15_softedge_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_lora_rank128_v11p_sd15s2_lineart_anime_fp16.safetensors",
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-canny-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-color-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-depth-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-fuser-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-sketch-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_canny_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_canny_sd15v2.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_color_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_depth_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_depth_sd15v2.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_keypose_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_openpose_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_seg_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_sketch_sd14v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_sketch_sd15v2.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_zoedepth_sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models_XL/adapter-xl-canny.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models_XL/adapter-xl-canny.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models_XL/adapter-xl-canny.pth"
    },
]

ipadapter = [
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15_light.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus_sd15.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus-face_sd15.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-full-face_sd15.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl_vit-h.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus-face_sdxl_vit-h.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sd15.bin",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plus_sd15.bin",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sd15.bin",
    },
]

clip = [
    {
        "url": "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
    },
    {
        "url": "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors"
    },
    {
        "url": "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors"
    }
]

vae = [
    {
        "url": "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.sft"
    }
]

unet = [
    {
        "url": "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.sft"
    },
    {
        "url": "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.sft"
    }
]

clip_vision = [
    {
        "url": "https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/pytorch_model.bin",
        "file": "clip_vit_base_patch32.bin",
    },
    {
        "url": "https://huggingface.co/openai/clip-vit-large-patch14/resolve/main/pytorch_model.bin",
        "file": "clip_vit_large_patch14.bin",
    },
    {
        "url": "https://huggingface.co/laion/CLIP-ViT-H-14-laion2B-s32B-b79K/resolve/main/pytorch_model.bin",
        "file": "clip_vit_h.bin",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors",
        "file": "clip_vit_h.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/image_encoder/model.safetensors",
        "file": "clip_vit_bigG.safetensors",
    },
]

loras = [
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sd15_lora.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plus_sd15_lora.safetensors",
    },
    {
        "url": "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sd15_lora.safetensors",
    },
    {
        "url": "https://huggingface.co/ardhies/add_detail/resolve/main/add_detail.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.blonde-hair/resolve/main/blonde%20hair.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.brunette/resolve/main/brunette.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.partying/resolve/main/partying.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.magicalenchanted/resolve/main/magical%2Cenchanted.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.happy-crying/resolve/main/happy%20crying.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.fearful/resolve/main/fearful.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.begging/resolve/main/begging.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.scared/resolve/main/scared.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.joy/resolve/main/joy.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.magical-energy-swirling-around/resolve/main/magical%20energy%20swirling%20around.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.character-design/resolve/main/character%20design.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.very-very-very-cute/resolve/main/very%20very%20very%20cute.safetensors",
    },
    {
        "url": "https://huggingface.co/ntc-ai/SDXL-LoRA-slider.award-winning-film/resolve/main/award%20winning%20film.safetensors",
    },
]

annotator = [
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/150_16_swin_l_oneformer_coco_100ep.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/250_16_swin_l_oneformer_ade20k_160k.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/ControlNetHED.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/ControlNetLama.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/RealESRGAN_x4plus.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/body_pose_model.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/clip_g.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/dpt_hybrid-midas-501f0c75.pt",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/erika.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/facenet.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/hand_pose_model.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/lama.ckpt",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/latest_net_G.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/mlsd_large_512_fp32.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/netG.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/network-bsds500.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/res101.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/scannet.pt",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/sk_model.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/sk_model2.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/table5_pidinet.pth",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/upernet_global_small.pth",
    },
    {
        "url": "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.ckpt",
    },
    {
        "url": "https://huggingface.co/lllyasviel/Annotators/resolve/main/ZoeD_M12_N.pt",
    },
]

upscale_models = [
    {
        "url": "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x2.pth",
    },
    {
        "url": "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4.pth",
    },
    {
        "url": "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x8.pth",
    },
    {
        "url": "https://huggingface.co/ximso/RealESRGAN_x4plus_anime_6B/resolve/main/RealESRGAN_x4plus_anime_6B.pth",
    },
    {
        "url": "https://huggingface.co/utnah/esrgan/resolve/main/1x_ISO_denoise_v1.pth",
    },
    {
        "url": "https://huggingface.co/utnah/esrgan/resolve/main/1x_JPEGDestroyerV2_96000G.pth",
    },
    {
        "url": "https://huggingface.co/utnah/esrgan/resolve/main/4x-DeCompress-Strong.pth",
    },
]

style_models = [
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/coadapter-style-sd15v1.pth"
    },
    {
        "url": "https://huggingface.co/TencentARC/T2I-Adapter/resolve/main/models/t2iadapter_style_sd14v1.pth"
    },
]


def file_or_url_basename(m: dict[str, str]) -> str:
    return m["file"] if "file" in m else os.path.basename(m["url"])


def files_for(model_list: list[dict[str, str]]) -> list[str]:
    return [file_or_url_basename(m) for m in model_list]


model_files = {
    "clip": files_for(clip),
    "vae": files_for(vae),
    "unet": files_for(unet),
    "checkpoints": files_for(checkpoints),
    "loras": files_for(loras),
    "clip_vision": files_for(clip_vision),
    "style_models": files_for(style_models),
    "controlnet": files_for(controlnet),
    "upscale_models": files_for(upscale_models),
    "annotator": files_for(annotator),
}

TYPE_ENUM_TO_MODEL_FILES = {
    "comfy.checkpoint_file": "checkpoints",
    "comfy.lora_file": "loras",
    "comfy.clip_vision_file": "clip_vision",
    "comfy.control_net_file": "controlnet",
    "comfy.upscale_model_file": "upscale_models",
}
