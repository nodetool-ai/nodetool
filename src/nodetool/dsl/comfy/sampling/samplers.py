from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.sampling

class KSamplerSelect(GraphNode):
    """
    Select a specific sampler for the diffusion process with different performance characteristics and output qualities.
    sampling, diffusion
    Use cases:
    - Experimenting with different sampling methods for optimal image quality
    - Balancing speed vs quality in image generation
    - Testing model behavior with different sampling algorithms
    """

    SamplerEnum: typing.ClassVar[type] = nodetool.nodes.comfy.sampling.KSamplerSelect.SamplerEnum
    sampler_name: nodetool.nodes.comfy.sampling.KSamplerSelect.SamplerEnum = Field(default=SamplerEnum.DDIM, description='The name of the sampler.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.KSamplerSelect"



class SamplerCustom(GraphNode):
    """
    Customizable sampling process with fine-grained control over noise, CFG, and conditioning parameters.
    sampling, cfg, noise, conditioning
    Use cases:
    - Advanced sampling control for complex image generation tasks
    - Customizing sampling parameters for specific models or tasks
    - Fine-tuning sampling for specific effects or styles
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model used by the sampler.')
    add_noise: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to add noise or not.')
    noise_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The seed for the noise generation.')
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg (classifier-free guidance) parameter.')
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The positive conditioning.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The negative conditioning.')
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler(type='comfy.sampler', data=None), description='The sampler to use.')
    sigmas: Sigmas | GraphNode | tuple[GraphNode, str] = Field(default=Sigmas(type='comfy.sigmas', data=None), description='The sigmas used in sampling.')
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent image to sample from.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerCustom"



class SamplerCustomAdvanced(GraphNode):
    """
    Advanced sampling implementation with separate control over noise, guidance, and multiple output options.
    sampling, noise, guidance, cfg
    Use cases:
    - Complex image generation requiring precise noise control
    - Workflows needing access to intermediate denoised results
    - Advanced guidance-based sampling applications
    """

    noise: Noise | GraphNode | tuple[GraphNode, str] = Field(default=Noise(type='comfy.noise', data=None), description='The noise to apply.')
    guider: Guider | GraphNode | tuple[GraphNode, str] = Field(default=Guider(type='comfy.guider', data=None), description='The guider to apply.')
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler(type='comfy.sampler', data=None), description='The sampler to use.')
    sigmas: Sigmas | GraphNode | tuple[GraphNode, str] = Field(default=Sigmas(type='comfy.sigmas', data=None), description='The sigmas used in sampling.')
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent image to sample from.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerCustomAdvanced"


import nodetool.nodes.comfy.sampling.samplers
import nodetool.nodes.comfy.sampling.samplers

class SamplerDPMPP_2M_SDE(GraphNode):
    """
    Advanced DPMPP (2M) SDE sampler implementation offering high-quality results with fewer steps.
    sampling, diffusion, sde, dpmpp
    Use cases:
    - High-quality image generation with reduced step count
    - Performance-optimized sampling for production workflows
    - Advanced noise control with GPU/CPU options
    """

    SolverTypeEnum: typing.ClassVar[type] = nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_2M_SDE.SolverTypeEnum
    DeviceEnum: typing.ClassVar[type] = nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_2M_SDE.DeviceEnum
    solver_type: nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_2M_SDE.SolverTypeEnum = Field(default=SolverTypeEnum.MIDPOINT, description='The type of solver.')
    eta: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The eta parameter.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale noise factor.')
    noise_device: nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_2M_SDE.DeviceEnum = Field(default=DeviceEnum.GPU, description="The device for noise generation, either 'gpu' or 'cpu'.")

    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerDPMPP_2M_SDE"


import nodetool.nodes.comfy.sampling.samplers

class SamplerDPMPP_SDE(GraphNode):
    """
    Implementation of DPMPP SDE sampler with configurable noise and performance parameters.
    sampling, diffusion, sde, dpmpp
    Use cases:
    - Efficient image generation with controllable noise levels
    - Fine-tuning sampling parameters for specific image styles
    - Balancing quality and speed with custom parameters
    """

    DeviceEnum: typing.ClassVar[type] = nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_SDE.DeviceEnum
    eta: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The eta parameter.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale noise factor.')
    r: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The r parameter.')
    noise_device: nodetool.nodes.comfy.sampling.samplers.SamplerDPMPP_SDE.DeviceEnum = Field(default=DeviceEnum.GPU, description="The device for noise generation, either 'gpu' or 'cpu'.")

    @classmethod
    def get_node_type(cls): return "comfy.sampling.samplers.SamplerDPMPP_SDE"


