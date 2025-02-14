from enum import Enum
from pydantic import Field
from nodetool.metadata.types import (
    Conditioning,
    Guider,
    Latent,
    Noise,
    Sampler,
    Sigmas,
    UNet,
)
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.nodes.comfy.sampling import SamplerEnum

import comfy_extras.nodes_custom_sampler


class KSamplerSelect(ComfyNode):
    """
    Select a specific sampler for the diffusion process with different performance characteristics and output qualities.
    sampling, diffusion
    Use cases:
    - Experimenting with different sampling methods for optimal image quality
    - Balancing speed vs quality in image generation
    - Testing model behavior with different sampling algorithms
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.KSamplerSelect

    sampler_name: SamplerEnum = Field(
        default=SamplerEnum.DDIM, description="The name of the sampler."
    )

    @classmethod
    def return_type(cls):
        return {"sampler": Sampler}


class SolverTypeEnum(str, Enum):
    MIDPOINT = "midpoint"
    HEUN = "heun"


class DeviceEnum(str, Enum):
    GPU = "gpu"
    CPU = "cpu"


class SamplerDPMPP_2M_SDE(ComfyNode):
    """
    Advanced DPMPP (2M) SDE sampler implementation offering high-quality results with fewer steps.
    sampling, diffusion, sde, dpmpp
    Use cases:
    - High-quality image generation with reduced step count
    - Performance-optimized sampling for production workflows
    - Advanced noise control with GPU/CPU options
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SamplerDPMPP_2M_SDE

    solver_type: SolverTypeEnum = Field(
        default=SolverTypeEnum.MIDPOINT, description="The type of solver."
    )
    eta: float = Field(default=1.0, description="The eta parameter.")
    s_noise: float = Field(default=1.0, description="The scale noise factor.")
    noise_device: DeviceEnum = Field(
        default=DeviceEnum.GPU,
        description="The device for noise generation, either 'gpu' or 'cpu'.",
    )

    @classmethod
    def return_type(cls):
        return {"sampler": Sampler}


class SamplerDPMPP_SDE(ComfyNode):
    """
    Implementation of DPMPP SDE sampler with configurable noise and performance parameters.
    sampling, diffusion, sde, dpmpp
    Use cases:
    - Efficient image generation with controllable noise levels
    - Fine-tuning sampling parameters for specific image styles
    - Balancing quality and speed with custom parameters
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SamplerDPMPP_SDE

    eta: float = Field(default=1.0, description="The eta parameter.")
    s_noise: float = Field(default=1.0, description="The scale noise factor.")
    r: float = Field(default=0.5, description="The r parameter.")
    noise_device: DeviceEnum = Field(
        default=DeviceEnum.GPU,
        description="The device for noise generation, either 'gpu' or 'cpu'.",
    )

    @classmethod
    def return_type(cls):
        return {"sampler": Sampler}


class SamplerCustom(ComfyNode):
    """
    Customizable sampling process with fine-grained control over noise, CFG, and conditioning parameters.
    sampling, cfg, noise, conditioning
    Use cases:
    - Advanced sampling control for complex image generation tasks
    - Customizing sampling parameters for specific models or tasks
    - Fine-tuning sampling for specific effects or styles
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SamplerCustom

    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    add_noise: bool = Field(default=True, description="Whether to add noise or not.")
    noise_seed: int = Field(default=0, description="The seed for the noise generation.")
    cfg: float = Field(
        default=8.0, description="The cfg (classifier-free guidance) parameter."
    )
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning."
    )
    sampler: Sampler = Field(default=Sampler(), description="The sampler to use.")
    sigmas: Sigmas = Field(default=Sigmas(), description="The sigmas used in sampling.")
    latent_image: Latent = Field(
        default=Latent(), description="The latent image to sample from."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class SamplerCustomAdvanced(ComfyNode):
    """
    Advanced sampling implementation with separate control over noise, guidance, and multiple output options.
    sampling, noise, guidance, cfg
    Use cases:
    - Complex image generation requiring precise noise control
    - Workflows needing access to intermediate denoised results
    - Advanced guidance-based sampling applications
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SamplerCustomAdvanced

    noise: Noise = Field(default=Noise(), description="The noise to apply.")
    guider: Guider = Field(default=Guider(), description="The guider to apply.")
    sampler: Sampler = Field(default=Sampler(), description="The sampler to use.")
    sigmas: Sigmas = Field(default=Sigmas(), description="The sigmas used in sampling.")
    latent_image: Latent = Field(
        default=Latent(), description="The latent image to sample from."
    )

    @classmethod
    def return_type(cls):
        return {"output": Latent, "denoised_output": Latent}
