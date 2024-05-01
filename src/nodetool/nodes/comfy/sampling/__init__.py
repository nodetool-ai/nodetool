from enum import Enum
from pydantic import Field
from nodetool.metadata.types import Conditioning, Latent, UNet
from nodetool.common.comfy_node import EnableDisable
from nodetool.common.comfy_node import ComfyNode


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
    """
    The KSampler uses the provided model and positive and negative conditioning to generate a new version of the given latent. First the latent is noised up according to the given seed and denoise strength, erasing some of the latent image. then this noise is removed using the given Model and the positive and negative conditioning as guidance, "dreaming" up new details in places where the image was erased by noise.
    """

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
    """
    The KSampler Advanced node is the more advanced version of the KSampler node. While the KSampler node always adds noise to the latent followed by completely denoising the noised up latent, the KSampler Advanced node provides extra settings to control this behavior. The KSampler Advanced node can be told not to add noise into the latent with the add_noise setting. It can also be made to return partially denoised images via the return_with_leftover_noise setting. Unlike the KSampler node, this node does not have a denoise setting but this process is instead controlled by the start_at_step and end_at_step settings. This makes it possible to e.g. hand over a partially denoised latent to a separate KSampler Advanced node to finish the process.
    """

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
