from enum import Enum
from pydantic import Field
from genflow.metadata.types import Conditioning, Latent, UNet
from genflow.nodes.comfy import ComfyNode, EnableDisable


class SamplerEnum(str, Enum):
    DDIM = "ddim"
    UNI_PC = "uni_pc"
    UNI_PC_BH2 = "uni_pc_bh2"
    EULER = "euler"
    EULER_ANCESTRAL = "euler_ancestral"
    HEUN = "heun"
    HEUNPP2 = "heunpp2"
    DPM_2 = "dpm_2"
    DPM_2_ANCESTRAL = "dpm_2_ancestral"
    LMS = "lms"
    DPM_FAST = "dpm_fast"
    DPM_ADAPTIVE = "dpm_adaptive"
    DPMPP_2S_ANCESTRAL = "dpmpp_2s_ancestral"
    DPMPP_SDE = "dpmpp_sde"
    DPMPP_SDE_GPU = "dpmpp_sde_gpu"
    DPMPP_2M = "dpmpp_2m"
    DPMPP_2M_SDE = "dpmpp_2m_sde"
    DPMPP_2M_SDE_GPU = "dpmpp_2m_sde_gpu"
    DPMPP_3M_SDE = "dpmpp_3m_sde"
    DPMPP_3M_SDE_GPU = "dpmpp_3m_sde_gpu"
    DDPM = "ddpm"
    LCM = "lcm"


class SchedulerEnum(str, Enum):
    NORMAL = "normal"
    KARRAS = "karras"
    EXPONENTIAL = "exponential"
    SGM_UNIFORM = "sgm_uniform"
    SIMPLE = "simple"
    DDIM_UNIFORM = "ddim_uniform"


class KSampler(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model to use.")
    seed: int = Field(default=0, description="The seed to use.")
    steps: int = Field(default=20, description="The number of steps to use.")
    cfg: float = Field(default=8.0, description="The cfg to use.")
    sampler_name: SamplerEnum = Field(
        default=SamplerEnum.DDIM, description="The sampler to use."
    )
    scheduler: SchedulerEnum = Field(
        default=SchedulerEnum.NORMAL, description="The scheduler to use."
    )
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning to use."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning to use."
    )
    latent_image: Latent = Field(
        default=Latent(), description="The latent image to use."
    )
    denoise: float = Field(default=1.0, description="The denoise to use.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class KSamplerAdvanced(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model to use.")
    add_noise: EnableDisable = Field(
        default=EnableDisable.ENABLE, description="Enable or disable noise addition."
    )
    noise_seed: int = Field(default=0, description="The seed for noise generation.")
    steps: int = Field(
        default=20, description="The number of steps to use during sampling."
    )
    cfg: float = Field(
        default=8.0, description="The configuration value for the sampler."
    )
    sampler_name: SamplerEnum = Field(
        default=SamplerEnum.DDIM, description="The name of the sampler to use."
    )
    scheduler: SchedulerEnum = Field(
        default=SchedulerEnum.NORMAL, description="The scheduler to use."
    )
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning influence."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning influence."
    )
    latent_image: Latent = Field(
        default=Latent(), description="The starting latent image."
    )
    start_at_step: int = Field(
        default=0, description="The step at which to start the sampling process."
    )
    end_at_step: int = Field(
        default=10000, description="The step at which to end the sampling process."
    )
    return_with_leftover_noise: EnableDisable = Field(
        default=EnableDisable.DISABLE,
        description="Whether to return with leftover noise or not.",
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
