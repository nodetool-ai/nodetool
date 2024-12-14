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
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.comfy.sampling import SamplerEnum


class KSamplerSelect(ComfyNode):
    """
    The KSampler Select node allows choosing a specific sampler for the diffusion process.
    Different samplers can produce varying results or have different performance characteristics.
    """

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
    The SamplerDPMPP_2M_SDE node implements the DPMPP (2M) SDE sampler, which is an advanced
    sampling method that can potentially produce high-quality results with fewer steps.
    """

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
    The SamplerDPMPP_SDE node implements the DPMPP SDE sampler, another advanced sampling
    method that can offer good performance and quality in certain scenarios.
    """

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
    The SamplerCustom node provides a customizable sampling process, allowing fine-grained
    control over various sampling parameters including noise, CFG, and conditioning.
    """

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
    The SamplerCustomAdvanced node offers even more advanced customization options for
    the sampling process, including separate control over noise, guidance, and the ability
    to output both the final latent and the denoised latent.
    """

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
