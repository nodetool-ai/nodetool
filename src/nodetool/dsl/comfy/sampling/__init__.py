from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class DifferentialDiffusion(GraphNode):
    """
    Implements differential diffusion by modifying the model's denoise mask function. Adapted from https://github.com/exx8/differential-diffusion
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to modify.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.DifferentialDiffusion"


import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.sampling

class KSampler(GraphNode):
    """
    The KSampler uses the provided model and positive and negative conditioning to generate a new version of the given latent. First the latent is noised up according to the given seed and denoise strength, erasing some of the latent image. then this noise is removed using the given Model and the positive and negative conditioning as guidance, "dreaming" up new details in places where the image was erased by noise.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The seed to use.')
    seed_control_mode: nodetool.nodes.comfy.sampling.KSampler.SeedControlMode = Field(default=nodetool.nodes.comfy.sampling.KSampler.SeedControlMode('fixed'), description='The seed control mode to use.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to use.')
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg to use.')
    sampler_name: nodetool.nodes.comfy.sampling.KSampler.SamplerEnum = Field(default=nodetool.nodes.comfy.sampling.KSampler.SamplerEnum('ddim'), description='The sampler to use.')
    scheduler: nodetool.nodes.comfy.sampling.KSampler.SchedulerEnum = Field(default=nodetool.nodes.comfy.sampling.KSampler.SchedulerEnum('normal'), description='The scheduler to use.')
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The positive conditioning to use.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The negative conditioning to use.')
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent image to use.')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The denoise to use.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.KSampler"


import nodetool.nodes.comfy.comfy_node
import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.comfy_node

class KSamplerAdvanced(GraphNode):
    """
    The KSampler Advanced node is the more advanced version of the KSampler node. While the KSampler node always adds noise to the latent followed by completely denoising the noised up latent, the KSampler Advanced node provides extra settings to control this behavior. The KSampler Advanced node can be told not to add noise into the latent with the add_noise setting. It can also be made to return partially denoised images via the return_with_leftover_noise setting. Unlike the KSampler node, this node does not have a denoise setting but this process is instead controlled by the start_at_step and end_at_step settings. This makes it possible to e.g. hand over a partially denoised latent to a separate KSampler Advanced node to finish the process.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to use.')
    add_noise: nodetool.nodes.comfy.comfy_node.KSamplerAdvanced.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.KSamplerAdvanced.EnableDisable('enable'), description='Enable or disable noise addition.')
    noise_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The seed for noise generation.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to use during sampling.')
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The configuration value for the sampler.')
    sampler_name: nodetool.nodes.comfy.sampling.KSamplerAdvanced.SamplerEnum = Field(default=nodetool.nodes.comfy.sampling.KSamplerAdvanced.SamplerEnum('ddim'), description='The name of the sampler to use.')
    scheduler: nodetool.nodes.comfy.sampling.KSamplerAdvanced.SchedulerEnum = Field(default=nodetool.nodes.comfy.sampling.KSamplerAdvanced.SchedulerEnum('normal'), description='The scheduler to use.')
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The positive conditioning influence.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The negative conditioning influence.')
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The starting latent image.')
    start_at_step: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The step at which to start the sampling process.')
    end_at_step: int | GraphNode | tuple[GraphNode, str] = Field(default=10000, description='The step at which to end the sampling process.')
    return_with_leftover_noise: nodetool.nodes.comfy.comfy_node.KSamplerAdvanced.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.KSamplerAdvanced.EnableDisable('disable'), description='Whether to return with leftover noise or not.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.KSamplerAdvanced"


