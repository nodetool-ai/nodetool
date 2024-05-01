from enum import Enum
from pydantic import Field
from nodetool.metadata.types import Conditioning, Latent, Sampler, Sigmas, UNet
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.comfy.sampling import SamplerEnum


class KSamplerSelect(ComfyNode):
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
    def return_types(cls):
        return {"latent": Latent}, Latent
