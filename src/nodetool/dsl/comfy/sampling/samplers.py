from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.sampling import SamplerEnum

class KSamplerSelect(GraphNode):
    sampler_name: SamplerEnum | GraphNode | tuple[GraphNode, str] = Field(default=SamplerEnum('ddim'), description='The name of the sampler.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.KSamplerSelect"



class SamplerCustom(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model used by the sampler.')
    add_noise: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to add noise or not.')
    noise_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The seed for the noise generation.')
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg (classifier-free guidance) parameter.')
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The positive conditioning.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The negative conditioning.')
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler(type='comfy.sampler'), description='The sampler to use.')
    sigmas: Sigmas | GraphNode | tuple[GraphNode, str] = Field(default=Sigmas(type='comfy.sigmas'), description='The sigmas used in sampling.')
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent image to sample from.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerCustom"


from nodetool.nodes.comfy.sampling.samplers import SolverTypeEnum
from nodetool.nodes.comfy.sampling.samplers import DeviceEnum

class SamplerDPMPP_2M_SDE(GraphNode):
    solver_type: SolverTypeEnum | GraphNode | tuple[GraphNode, str] = Field(default=SolverTypeEnum('midpoint'), description='The type of solver.')
    eta: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The eta parameter.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale noise factor.')
    noise_device: DeviceEnum | GraphNode | tuple[GraphNode, str] = Field(default=DeviceEnum('gpu'), description="The device for noise generation, either 'gpu' or 'cpu'.")
    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerDPMPP_2M_SDE"


from nodetool.nodes.comfy.sampling.samplers import DeviceEnum

class SamplerDPMPP_SDE(GraphNode):
    eta: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The eta parameter.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale noise factor.')
    r: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The r parameter.')
    noise_device: DeviceEnum | GraphNode | tuple[GraphNode, str] = Field(default=DeviceEnum('gpu'), description="The device for noise generation, either 'gpu' or 'cpu'.")
    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerDPMPP_SDE"


