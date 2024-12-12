from enum import Enum
import os
from random import randint

from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_img2img import (
    StableDiffusionImg2ImgPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_latent_upscale import (
    StableDiffusionLatentUpscalePipeline,
)
from huggingface_hub import try_to_load_from_cache
from pydantic import Field
from typing import Any

import torch

from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    HFCLIP,
    HFLTXV,
    HFCLIPVision,
    HFControlNet,
    HFFlux,
    HFIPAdapter,
    HFLoraSDConfig,
    HFLoraSDXLConfig,
    HFStableDiffusion,
    HFStableDiffusion3,
    HFStableDiffusionXL,
    HFUnet,
    ImageRef,
)
from diffusers.schedulers.scheduling_dpmsolver_sde import DPMSolverSDEScheduler
from diffusers.schedulers.scheduling_euler_discrete import EulerDiscreteScheduler
from diffusers.schedulers.scheduling_lms_discrete import LMSDiscreteScheduler
from diffusers.schedulers.scheduling_ddim import DDIMScheduler
from diffusers.schedulers.scheduling_ddpm import DDPMScheduler
from diffusers.schedulers.scheduling_heun_discrete import HeunDiscreteScheduler
from diffusers.schedulers.scheduling_dpmsolver_multistep import (
    DPMSolverMultistepScheduler,
)
from diffusers.schedulers.scheduling_deis_multistep import DEISMultistepScheduler
from diffusers.schedulers.scheduling_pndm import PNDMScheduler
from diffusers.schedulers.scheduling_euler_ancestral_discrete import (
    EulerAncestralDiscreteScheduler,
)
from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
from diffusers.schedulers.scheduling_k_dpm_2_discrete import KDPM2DiscreteScheduler
from diffusers.schedulers.scheduling_dpmsolver_singlestep import (
    DPMSolverSinglestepScheduler,
)
from diffusers.schedulers.scheduling_k_dpm_2_ancestral_discrete import (
    KDPM2AncestralDiscreteScheduler,
)

from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress


log = Environment.get_logger()


class IPAdapter_SDXL_Model(str, Enum):
    NONE = ""
    IP_ADAPTER = "ip-adapter_sdxl.bin"
    IP_ADAPTER_PLUS = "ip-adapter-plus_sdxl_vit-h.bin"


class IPAdapter_SD15_Model(str, Enum):
    NONE = ""
    IP_ADAPTER = "ip-adapter_sd15.bin"
    IP_ADAPTER_LIGHT = "ip-adapter_sd15_light_v11.bin"
    IP_ADAPTER_PLUS = "ip-adapter-plus_sd15_vit-G.bin"


HF_IP_ADAPTER_MODELS = [
    HFIPAdapter(repo_id="h94/IP-Adapter", path="models/ip-adapter_sd15.bin"),
    HFIPAdapter(repo_id="h94/IP-Adapter", path="models/ip-adapter_sd15_light.bin"),
    HFIPAdapter(repo_id="h94/IP-Adapter", path="models/ip-adapter_sd15_vit-G.bin"),
]

HF_IP_ADAPTER_XL_MODELS = [
    HFIPAdapter(repo_id="h94/IP-Adapter", path="sdxl_models/ip-adapter_sdxl.bin"),
    HFIPAdapter(repo_id="h94/IP-Adapter", path="sdxl_models/ip-adapter_sdxl_vit-h.bin"),
    HFIPAdapter(
        repo_id="h94/IP-Adapter", path="sdxl_models/ip-adapter-plus_sdxl_vit-h.bin"
    ),
]


HF_STABLE_DIFFUSION_MODELS = [
    HFStableDiffusion(
        repo_id="SG161222/Realistic_Vision_V5.1_noVAE",
        path="Realistic_Vision_V5.1_fp16-no-ema.safetensors",
    ),
    HFStableDiffusion(
        repo_id="digiplay/majicMIX_realistic_v7",
        path="majicmixRealistic_v7.safetensors",
    ),
    HFStableDiffusion(
        repo_id="philz1337x/epicrealism",
        path="epicrealism_naturalSinRC1VAE.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Lykon/DreamShaper",
        path="DreamShaper_5_beta2_noVae_half_pruned.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Lykon/DreamShaper",
        path="DreamShaper_4BakedVae_fp16.safetensors",
    ),
    HFStableDiffusion(
        repo_id="XpucT/Deliberate",
        path="Deliberate_v6.safetensors",
    ),
    HFStableDiffusion(
        repo_id="XpucT/Deliberate",
        path="Deliberate_v6-inpainting.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Lykon/AbsoluteReality",
        path="AbsoluteReality_1.8.1_pruned.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Lykon/AbsoluteReality",
        path="AbsoluteReality_1.8.1_INPAINTING.inpainting.safetensors",
    ),
    HFStableDiffusion(
        repo_id="gsdf/Counterfeit-V2.5",
        path="Counterfeit-V2.5_fp16.safetensors",
    ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Deliberate2",
    #     path="Deliberate_v2.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/epiCPhotoGasm", path="epiCPhotoGasmVAE.safetensors"
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/YiffyMix",
    #     path="yiffymix_v31_vae.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/DreamPhotoGASM",
    #     path="DreamPhotoGASM.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/epiCEpic", path="epiCEpic.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/HyperRealism",
    #     path="Hyper_Realism_1.2_fp16.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/AbsoluteReality",
    #     path="absolutereality_v16.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/RealLife",
    #     path="reallife_v20.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/beLIEve",
    #     path="beLIEve.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/photoMovieXFinal",
    #     path="photoMovieXFinal.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/aMovieX",
    #     path="AmovieX.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/Paramount", path="Paramount.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/realisticStockPhoto3",
    #     path="realisticStockPhoto_v30SD15.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Analog",
    #     path="Analog.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/insaneRealistic_v2",
    #     path="insaneRealistic_v20.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/CyberRealistic",
    #     path="CyberRealistic20.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/photoMovieRealistic",
    #     path="photoMovieRealistic-no-ema.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/VisionVision", path="VisionVision.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/Timeless",
    #     path="Timeless.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/HyperRemix",
    #     path="HyperRemix.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/HyperPhotoGASM",
    #     path="HyperPhotoGASM.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/ZootVision", path="zootvisionAlpha_v10Alpha.safetensors"
    # ),
    # HFStableDiffusion(repo_id="Yntec/ChunkyCat", path="ChunkyCat.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/TickleYourFancy",
    #     path="TickleYourFancy.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/AllRoadsLeadToRetro",
    #     path="AllRoadsLeadToRetro.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/ClayStyle", path="ClayStyle.safetensors"),
    # HFStableDiffusion(repo_id="Yntec/epiCDream", path="epicdream_lullaby.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/Epsilon_Naught",
    #     path="Epsilon_Naught.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/BetterPonyDiffusion",
    #     path="betterPonyDiffusionV6_v20.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/ZootVisionEpsilon",
    #     path="zootvisionEpsilon_v50Epsilon.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/RevAnimatedV2Rebirth",
    #     path="revAnimated_v2RebirthVAE.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/AnimephilesAnonymous",
    #     path="AnimephilesAnonymous.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/GrandPrix",
    #     path="GrandPrix.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/InsaneSurreality",
    #     path="InsaneSurreality.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/DreamlikePhotoReal2",
    #     path="DreamlikePhotoReal2.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/DreamShaperRemix",
    #     path="DreamShaperRemix.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/epiCVision",
    #     path="epiCVision.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/IncredibleWorld2",
    #     path="incredibleWorld_v20.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/CrystalReality",
    #     path="CrystalReality.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/ZooFun",
    #     path="ZooFun.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/DreamWorks",
    #     path="DreamWorks.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/AnythingV7",
    #     path="AnythingV7.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/ICantBelieveItSNotPhotography",
    #     path="icbinpICantBelieveIts_v10_pruned.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/fennPhoto", path="fennPhoto_v10.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/Surreality",
    #     path="ChainGirl-Surreality.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/WinningBlunder",
    #     path="WinningBlunder.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Neurogen",
    #     path="NeurogenVAE.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Hyperlink",
    #     path="Hyperlink.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Disneyify",
    #     path="Disneyify_v1.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/DisneyPixarCartoon768",
    #     path="disneyPixarCartoonVAE.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Wonder",
    #     path="Wonder.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Voxel",
    #     path="VoxelVAE.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/Vintage",
    #     path="Vintage.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/BeautyFoolRemix",
    #     path="BeautyFoolRemix.safetensors",
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/handpaintedRPGIcons",
    #     path="handpaintedRPGIcons_v1.safetensors",
    # ),
    # HFStableDiffusion(repo_id="Yntec/526Mix", path="526mixV15.safetensors"),
    # HFStableDiffusion(repo_id="Yntec/majicmixLux", path="majicmixLux_v1.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/incha_re_zoro", path="inchaReZoro_v10.safetensors"
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/3DCartoonVision", path="3dCartoonVision_v10.safetensors"
    # ),
    # HFStableDiffusion(repo_id="Yntec/RetroRetro", path="RetroRetro.safetensors"),
    # HFStableDiffusion(repo_id="Yntec/ClassicToons", path="ClassicToons.safetensors"),
    # HFStableDiffusion(repo_id="Yntec/PixelKicks", path="PixelKicks.safetensors"),
    # HFStableDiffusion(
    #     repo_id="Yntec/NostalgicLife", path="NostalgicLifeVAE.safetensors"
    # ),
    # HFStableDiffusion(
    #     repo_id="Yntec/ArthemyComics",
    #     path="arthemyComics_v10Bakedvae.safetensors",
    # ),
]

HF_STABLE_DIFFUSION_XL_MODELS = [
    HFStableDiffusionXL(
        repo_id="stabilityai/stable-diffusion-xl-base-1.0",
        path="sd_xl_base_1.0.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="stabilityai/stable-diffusion-xl-refiner-1.0",
        path="sd_xl_refiner_1.0.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="playgroundai/playground-v2.5-1024px-aesthetic",
        path="playground-v2.5-1024px-aesthetic.fp16.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="RunDiffusion/Juggernaut-XL-v9",
        path="Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="dataautogpt3/ProteusV0.5",
        path="proteusV0.5.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="Lykon/dreamshaper-xl-lightning",
        path="DreamShaperXL_Lightning.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="Lykon/AAM_XL_AnimeMix",
        path="AAM_XL_Anime_Mix.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="stabilityai/sdxl-turbo", path="sd_xl_turbo_1.0_fp16.safetensors"
    ),
    HFStableDiffusionXL(
        repo_id="Lykon/dreamshaper-xl-v2-turbo",
        path="DreamShaperXL_Turbo_v2_1.safetensors",
    ),
]

HF_STABLE_DIFFUSION_3_MODELS = [
    HFStableDiffusion3(
        repo_id="Comfy-Org/stable-diffusion-3.5-fp8",
        path="sd3.5_large_fp8_scaled.safetensors",
    ),
    HFStableDiffusion3(
        repo_id="Comfy-Org/stable-diffusion-3.5-fp8",
        path="sd3.5_medium_incl_clips_t5xxlfp8scaled.safetensors",
    ),
]

HF_FLUX_MODELS = [
    HFFlux(
        repo_id="Comfy-Org/flux1-dev",
        path="flux1-dev-fp8.safetensors",
    ),
    HFFlux(
        repo_id="Comfy-Org/flux1-schnell",
        path="flux1-schnell-fp8.safetensors",
    ),
    HFFlux(
        repo_id="black-forest-labs/FLUX.1-Fill-dev",
        path="flux1-fill-dev.safetensors",
    ),
]

HF_CONTROLNET_MODELS: list[HFControlNet] = [
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_canny",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_inpaint",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_mlsd",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_tile",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_shuffle",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_ip2p",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_lineart",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_lineart_anime",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_scribble",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_openpose",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_scribble",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_seg",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_hed",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_normalbae",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
]

HF_CONTROL_NET_XL_MODELS: list[HFControlNet] = [
    HFControlNet(
        repo_id="diffusers/controlnet-canny-sdxl-1.0",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="diffusers/controlnet-depth-sdxl-1.0",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="diffusers/controlnet-zoe-depth-sdxl-1.0",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
]

HF_LTXV_MODELS = [
    HFLTXV(
        repo_id="Lightricks/LTX-Video",
        path="ltx-video-2b-v0.9.safetensors",
    ),
]

HF_CLIP_MODELS = [
    HFCLIP(
        repo_id="Comfy-Org/mochi_preview_repackaged",
        path="split_files/text_encoders/t5xxl_fp16.safetensors",
    ),
    HFCLIP(
        repo_id="Comfy-Org/mochi_preview_repackaged",
        path="split_files/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors",
    ),
    HFCLIP(repo_id="comfyanonymous/flux_text_encoders", path="clip_l.safetensors"),
    HFCLIP(
        repo_id="comfyanonymous/flux_text_encoders",
        path="t5xxl_fp16.safetensors",
    ),
]

HF_CLIP_VISION_MODELS = [
    HFCLIPVision(
        repo_id="Comfy-Org/sigclip_vision_384",
        path="sigclip_vision_patch14_384.safetensors",
    ),
    HFCLIPVision(
        repo_id="h94/IP-Adapter",
        path="models/image_encoder/model.safetensors",
    ),
    HFCLIPVision(
        repo_id="h94/IP-Adapter",
        path="sdxl_models/image_encoder/model.safetensors",
    ),
]

HF_UNET_MODELS = [
    HFUnet(
        repo_id="Comfy-Org/mochi_preview_repackaged",
        path="split_files/diffusion_models/mochi_preview_bf16.safetensors",
    ),
    HFUnet(
        repo_id="Comfy-Org/mochi_preview_repackaged",
        path="split_files/diffusion_models/mochi_preview_fp8_scaled.safetensors",
    ),
    HFUnet(
        repo_id="black-forest-labs/FLUX.1-dev",
        path="flux1-dev.safetensors",
    ),
    HFUnet(
        repo_id="black-forest-labs/FLUX.1-schnell",
        path="flux1-schnell.safetensors",
    ),
]


class StableDiffusionScheduler(str, Enum):
    DPMSolverSDEScheduler = "DPMSolverSDEScheduler"
    EulerDiscreteScheduler = "EulerDiscreteScheduler"
    LMSDiscreteScheduler = "LMSDiscreteScheduler"
    DDIMScheduler = "DDIMScheduler"
    DDPMScheduler = "DDPMScheduler"
    HeunDiscreteScheduler = "HeunDiscreteScheduler"
    DPMSolverMultistepScheduler = "DPMSolverMultistepScheduler"
    DEISMultistepScheduler = "DEISMultistepScheduler"
    PNDMScheduler = "PNDMScheduler"
    EulerAncestralDiscreteScheduler = "EulerAncestralDiscreteScheduler"
    UniPCMultistepScheduler = "UniPCMultistepScheduler"
    KDPM2DiscreteScheduler = "KDPM2DiscreteScheduler"
    DPMSolverSinglestepScheduler = "DPMSolverSinglestepScheduler"
    KDPM2AncestralDiscreteScheduler = "KDPM2AncestralDiscreteScheduler"


def get_scheduler_class(scheduler: StableDiffusionScheduler):
    if scheduler == StableDiffusionScheduler.DPMSolverSDEScheduler:
        return DPMSolverSDEScheduler
    elif scheduler == StableDiffusionScheduler.EulerDiscreteScheduler:
        return EulerDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.LMSDiscreteScheduler:
        return LMSDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DDIMScheduler:
        return DDIMScheduler
    elif scheduler == StableDiffusionScheduler.DDPMScheduler:
        return DDPMScheduler
    elif scheduler == StableDiffusionScheduler.HeunDiscreteScheduler:
        return HeunDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DPMSolverMultistepScheduler:
        return DPMSolverMultistepScheduler
    elif scheduler == StableDiffusionScheduler.DEISMultistepScheduler:
        return DEISMultistepScheduler
    elif scheduler == StableDiffusionScheduler.PNDMScheduler:
        return PNDMScheduler
    elif scheduler == StableDiffusionScheduler.EulerAncestralDiscreteScheduler:
        return EulerAncestralDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.UniPCMultistepScheduler:
        return UniPCMultistepScheduler
    elif scheduler == StableDiffusionScheduler.KDPM2DiscreteScheduler:
        return KDPM2DiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DPMSolverSinglestepScheduler:
        return DPMSolverSinglestepScheduler
    elif scheduler == StableDiffusionScheduler.KDPM2AncestralDiscreteScheduler:
        return KDPM2AncestralDiscreteScheduler


class StableDiffusionDetailLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


def load_loras(pipeline: Any, loras: list[HFLoraSDConfig] | list[HFLoraSDXLConfig]):
    log.info(f"Loading LORAS {loras}")

    loras = [lora for lora in loras if lora.lora.is_set()]  # type: ignore

    if len(loras) == 0:
        return

    lora_names = []
    lora_weights = []
    for lora in loras:
        cache_path = try_to_load_from_cache(
            lora.lora.repo_id,
            lora.lora.path or "",
        )
        if cache_path is None:
            raise ValueError(
                f"Install {lora.lora.repo_id}/{lora.lora.path} LORA to use it (Recommended Models above)"
            )
        log.info(f"Loading LORA {lora.lora.repo_id}/{lora.lora.path}")

        base_name = os.path.basename(lora.lora.path or "").split(".")[0]
        lora_names.append(base_name)
        lora_weights.append(lora.strength)
        pipeline.load_lora_weights(cache_path, adapter_name=base_name)

    pipeline.set_adapters(lora_names, adapter_weights=lora_weights)


def quantize_to_multiple_of_64(value):
    return round(value / 64) * 64


class StableDiffusionBaseNode(HuggingFacePipelineNode):
    model: HFStableDiffusion = Field(
        default=HFStableDiffusion(),
        description="The model to use for image generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    negative_prompt: str = Field(
        default="(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=2**32 - 1,
        description="Seed for the random number generator. Use -1 for a random seed.",
    )
    num_inference_steps: int = Field(
        default=25, ge=1, le=100, description="Number of denoising steps."
    )
    guidance_scale: float = Field(
        default=7.5, ge=1.0, le=20.0, description="Guidance scale for generation."
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.HeunDiscreteScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    loras: list[HFLoraSDConfig] = Field(
        default=[],
        description="The LoRA models to use for image processing",
    )
    ip_adapter_model: HFIPAdapter = Field(
        default=HFIPAdapter(),
        description="The IP adapter model to use for image processing",
    )
    ip_adapter_image: ImageRef = Field(
        default=ImageRef(),
        description="When provided the image will be fed into the IP adapter",
    )
    ip_adapter_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="The strength of the IP adapter",
    )
    detail_level: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.",
    )
    enable_tiling: bool = Field(
        default=False,
        description="Enable tiling for the VAE. This can reduce VRAM usage.",
    )
    enable_cpu_offload: bool = Field(
        default=False,
        description="Enable CPU offload for the pipeline. This can reduce VRAM usage.",
    )
    _loaded_adapters: set[str] = set()
    _pipeline: Any = None
    _upscaler: StableDiffusionLatentUpscalePipeline | None = None

    @classmethod
    def get_recommended_models(cls):
        return (
            HF_IP_ADAPTER_MODELS
            + HF_STABLE_DIFFUSION_MODELS
            + HF_IP_ADAPTER_MODELS
            + [
                HFStableDiffusion(
                    repo_id="stabilityai/sd-x2-latent-upscaler",
                    allow_patterns=[
                        "README.md",
                        "**/*.safetensors",
                        "**/*.json",
                        "**/*.txt",
                        "*.json",
                    ],
                ),
            ]
        )

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionBaseNode

    async def pre_process(self, context: ProcessingContext):
        if self.seed == -1:
            self.seed = randint(0, 2**32 - 1)

    def should_skip_cache(self):
        if self.ip_adapter_model.repo_id != "":
            return True
        if len(self.loras) > 0:
            return True
        return False

    def _load_ip_adapter(self):
        if self.ip_adapter_model.repo_id != "" and self.ip_adapter_model.path:
            cache_path = try_to_load_from_cache(
                self.ip_adapter_model.repo_id, self.ip_adapter_model.path
            )
            if cache_path is None:
                raise ValueError(
                    f"Install the {self.ip_adapter_model.repo_id}/{self.ip_adapter_model.path} IP Adapter model to use it (Recommended Models above)"
                )
            path_parts = self.ip_adapter_model.path.split("/")
            subfolder = "/".join(path_parts[0:-1])
            weight_name = path_parts[-1]
            log.info(
                f"Loading IP Adapter {self.ip_adapter_model.repo_id}/{self.ip_adapter_model.path}"
            )
            self._pipeline.load_ip_adapter(
                self.ip_adapter_model.repo_id,
                subfolder=subfolder,
                weight_name=weight_name,
            )

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        scheduler_class = get_scheduler_class(scheduler_type)
        self._pipeline.scheduler = scheduler_class.from_config(
            self._pipeline.scheduler.config
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)
        if self._upscaler is not None:
            self._upscaler.to(device)

    def _setup_generator(self):
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)
        return generator

    def progress_callback(
        self,
        context: ProcessingContext,
        offset: int | None = None,
        total: int | None = None,
    ):
        if offset is None:
            offset = 0
        if total is None:
            total = self.num_inference_steps

        def callback(step: int, timestep: int, latents: torch.Tensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=offset + step,
                    total=total,
                )
            )

        return callback

    async def run_pipeline(self, context: ProcessingContext, **kwargs) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        if self.enable_tiling:
            self._pipeline.vae.enable_tiling()

        if self.enable_cpu_offload:
            self._pipeline.enable_model_cpu_offload()

        loras = [
            lora for lora in self.loras if not lora.lora.path in self._loaded_adapters
        ]
        load_loras(self._pipeline, loras)
        self._loaded_adapters.update(lora.lora.path for lora in loras if lora.lora.path)

        generator = self._setup_generator()
        if self.ip_adapter_image.is_set():
            if self.ip_adapter_model.repo_id == "":
                raise ValueError("Select an IP Adapter model")
            ip_adapter_image = await context.image_to_pil(self.ip_adapter_image)
        else:
            ip_adapter_image = None

        self._pipeline.set_ip_adapter_scale(self.ip_adapter_scale)

        width = kwargs.get("width", None)
        height = kwargs.get("height", None)

        if width is not None:
            width = quantize_to_multiple_of_64(width)
            kwargs["width"] = width

        if height is not None:
            height = quantize_to_multiple_of_64(height)
            kwargs["height"] = height

        hires = (
            width is not None
            and height is not None
            and (width >= 1024 or height >= 1024)
        )

        if hires:
            self._upscaler = await self.load_model(
                context=context,
                model_class=StableDiffusionLatentUpscalePipeline,
                model_id="stabilityai/sd-x2-latent-upscaler",
                variant=None,
            )
            self._upscaler.to(context.device)
            # Calculate ratio on a continuous scale
            if self.num_inference_steps <= 50:
                low_res_ratio = 1 / 3 + (self.num_inference_steps - 25) / 75
            else:
                low_res_ratio = (
                    1 / 3 + (50 - 25) / 75 + (self.num_inference_steps - 50) / 300
                )

            low_res_ratio = min(1 / 3, max(1 / 5, low_res_ratio))
            low_res_steps = max(int(self.num_inference_steps * low_res_ratio), 10)
            hi_res_steps = max(self.num_inference_steps - low_res_steps, 10)

            total = self.num_inference_steps + 20  # Include upscaler steps

            # Calculate denoising strength and guidance scale based on detail_level
            denoising_strength = 0.3 + (self.detail_level * 0.4)  # Range: 0.3 to 0.7
            hi_res_guidance_scale = self.guidance_scale + (
                self.detail_level * self.guidance_scale
            )

            # Ensure values are within valid ranges
            denoising_strength = max(0.0, min(1.0, denoising_strength))
            hi_res_guidance_scale = max(0.0, hi_res_guidance_scale)

            low_res_kwargs = kwargs.copy()
            low_res_kwargs["width"] = int(width / 2)
            low_res_kwargs["height"] = int(height / 2)

            upscale_steps = 20

            # Adjust upscale guidance scale based on detail level
            upscale_guidance_scale = 1.0 + (
                self.detail_level * 0.5
            )  # Range: 1.0 to 1.5
            upscale_guidance_scale = max(1.0, min(2.0, upscale_guidance_scale))

            # Generate low-res latents
            low_res_result = self._pipeline(
                prompt=self.prompt,
                negative_prompt=self.negative_prompt,
                num_inference_steps=low_res_steps,
                guidance_scale=self.guidance_scale,
                generator=generator,
                ip_adapter_image=ip_adapter_image,
                callback=self.progress_callback(context, 0, total),
                callback_steps=1,
                output_type="latent",
                **low_res_kwargs,
            )
            low_res_latents = low_res_result.images

            assert self._upscaler is not None

            # Upscale latents
            upscaled_latents = self._upscaler(
                prompt=self.prompt,
                negative_prompt=self.negative_prompt,
                image=low_res_latents,
                num_inference_steps=upscale_steps,
                guidance_scale=upscale_guidance_scale,
                generator=generator,
                output_type="latent",
                callback=self.progress_callback(context, low_res_steps, total),
                callback_steps=1,
            ).images[  # type: ignore
                0
            ]

            # Prepare img2img pipeline for hi-res pass
            if "image" in kwargs:
                img2img_pipe = self._pipeline
            else:
                img2img_pipe = StableDiffusionImg2ImgPipeline(
                    vae=self._pipeline.vae,
                    text_encoder=self._pipeline.text_encoder,
                    image_encoder=self._pipeline.image_encoder,
                    tokenizer=self._pipeline.tokenizer,
                    unet=self._pipeline.unet,
                    scheduler=self._pipeline.scheduler,
                    safety_checker=self._pipeline.safety_checker,
                    feature_extractor=self._pipeline.feature_extractor,
                )

            # Generate final high-res image
            hires_kwargs = kwargs.copy()
            if "strength" not in hires_kwargs:
                hires_kwargs["strength"] = denoising_strength
            if "image" in hires_kwargs:
                del hires_kwargs["image"]
            # Add width and height to ensure correct output dimensions
            hires_kwargs["width"] = width
            hires_kwargs["height"] = height

            img2img_pipe.vae.enable_tiling()
            image = img2img_pipe(
                image=upscaled_latents.unsqueeze(0),  # type: ignore
                prompt=self.prompt + ", hires",
                negative_prompt=self.negative_prompt,
                num_inference_steps=hi_res_steps,
                guidance_scale=hi_res_guidance_scale,
                generator=generator,
                ip_adapter_image=ip_adapter_image,
                cross_attention_kwargs={"scale": 1.0},
                callback=self.progress_callback(context, low_res_steps + 20, total),
                callback_steps=1,
                **hires_kwargs,
            ).images[  # type: ignore
                0
            ]
        else:
            image = self._pipeline(
                prompt=self.prompt,
                negative_prompt=self.negative_prompt,
                num_inference_steps=self.num_inference_steps,
                guidance_scale=self.guidance_scale,
                generator=generator,
                ip_adapter_image=ip_adapter_image,
                cross_attention_kwargs={"scale": 1.0},
                callback=self.progress_callback(context, 0, self.num_inference_steps),
                callback_steps=1,
                **kwargs,
            ).images[0]

        return await context.image_from_pil(image)

    async def process(self, context: ProcessingContext) -> ImageRef:
        raise NotImplementedError("Subclasses must implement this method")


class StableDiffusionXLBase(HuggingFacePipelineNode):
    model: HFStableDiffusionXL = Field(
        default=HFStableDiffusionXL(),
        description="The Stable Diffusion XL model to use for generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=1000000,
        description="Seed for the random number generator.",
    )
    num_inference_steps: int = Field(
        default=25, ge=1, le=100, description="Number of inference steps."
    )
    guidance_scale: float = Field(
        default=7.0, ge=0.0, le=20.0, description="Guidance scale for generation."
    )
    width: int = Field(
        default=1024, ge=64, le=2048, description="Width of the generated image."
    )
    height: int = Field(
        default=1024, ge=64, le=2048, description="Height of the generated image"
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.DDIMScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    loras: list[HFLoraSDXLConfig] = Field(
        default=[],
        description="The LoRA models to use for image processing",
    )
    lora_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the LoRAs",
    )
    ip_adapter_model: HFIPAdapter = Field(
        default=HFIPAdapter(),
        description="The IP adapter model to use for image processing",
    )
    ip_adapter_image: ImageRef = Field(
        default=ImageRef(),
        description="When provided the image will be fed into the IP adapter",
    )
    ip_adapter_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the IP adapter image",
    )
    enable_tiling: bool = Field(
        default=False,
        description="Enable tiling for the VAE. This can reduce VRAM usage.",
    )
    enable_cpu_offload: bool = Field(
        default=False,
        description="Enable CPU offload for the pipeline. This can reduce VRAM usage.",
    )

    _loaded_adapters: set[str] = set()
    _pipeline: Any = None

    @classmethod
    def get_recommended_models(cls):
        return HF_IP_ADAPTER_XL_MODELS + HF_STABLE_DIFFUSION_XL_MODELS

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionXLBase

    async def pre_process(self, context: ProcessingContext):
        if self.seed == -1:
            self.seed = randint(0, 2**32 - 1)

    def should_skip_cache(self):
        if self.ip_adapter_model.repo_id != "":
            return True
        if len(self.loras) > 0:
            return True
        return False

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        scheduler_class = get_scheduler_class(scheduler_type)
        if "turbo" in self.model.repo_id:
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config,
                timestep_spacing="trailing",
            )
        else:
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config,
            )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    def _setup_generator(self):
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)
        return generator

    def _load_ip_adapter(self):
        if self.ip_adapter_model.repo_id != "" and self.ip_adapter_model.path:
            cache_path = try_to_load_from_cache(
                self.ip_adapter_model.repo_id, self.ip_adapter_model.path
            )
            if cache_path is None:
                raise ValueError(
                    f"Install the {self.ip_adapter_model.repo_id}/{self.ip_adapter_model.path} IP Adapter model to use it (Recommended Models above)"
                )
            path_parts = self.ip_adapter_model.path.split("/")
            subfolder = "/".join(path_parts[0:-1])
            weight_name = path_parts[-1]
            log.info(
                f"Loading IP Adapter {self.ip_adapter_model.repo_id}/{self.ip_adapter_model.path}"
            )
            self._pipeline.load_ip_adapter(
                self.ip_adapter_model.repo_id,
                subfolder=subfolder,
                weight_name=weight_name,
            )

    def progress_callback(self, context: ProcessingContext):
        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        return callback

    async def run_pipeline(self, context: ProcessingContext, **kwargs) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        if self.enable_tiling:
            self._pipeline.vae.enable_tiling()

        if self.enable_cpu_offload:
            self._pipeline.enable_model_cpu_offload()

        loras = [
            lora for lora in self.loras if not lora.lora.path in self._loaded_adapters
        ]
        load_loras(self._pipeline, loras)
        self._loaded_adapters.update(lora.lora.path for lora in loras if lora.lora.path)

        generator = self._setup_generator()
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

        image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
            callback=self.progress_callback(context),
            callback_steps=1,
            generator=generator,
            **kwargs,
        ).images[0]

        return await context.image_from_pil(image)

    async def process(self, context: ProcessingContext) -> ImageRef:
        raise NotImplementedError("Subclasses must implement this method")
