from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.sampling import SamplerEnum
from nodetool.nodes.comfy.sampling import SchedulerEnum


class KSampler(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(
        default=UNet(type="comfy.unet"), description="The model to use."
    )
    seed: int | GraphNode | tuple[GraphNode, str] = Field(
        default=0, description="The seed to use."
    )
    steps: int | GraphNode | tuple[GraphNode, str] = Field(
        default=20, description="The number of steps to use."
    )
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(
        default=8.0, description="The cfg to use."
    )
    sampler_name: SamplerEnum | GraphNode | tuple[GraphNode, str] = Field(
        default=SamplerEnum("ddim"), description="The sampler to use."
    )
    scheduler: SchedulerEnum | GraphNode | tuple[GraphNode, str] = Field(
        default=SchedulerEnum("normal"), description="The scheduler to use."
    )
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(
        default=Conditioning(type="comfy.conditioning"),
        description="The positive conditioning to use.",
    )
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(
        default=Conditioning(type="comfy.conditioning"),
        description="The negative conditioning to use.",
    )
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(
        default=Latent(type="comfy.latent"), description="The latent image to use."
    )
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(
        default=1.0, description="The denoise to use."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.sampling.KSampler"


from nodetool.common.comfy_node import EnableDisable
from nodetool.nodes.comfy.sampling import SamplerEnum
from nodetool.nodes.comfy.sampling import SchedulerEnum
from nodetool.common.comfy_node import EnableDisable


class KSamplerAdvanced(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(
        default=UNet(type="comfy.unet"), description="The model to use."
    )
    add_noise: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("enable"), description="Enable or disable noise addition."
    )
    noise_seed: int | GraphNode | tuple[GraphNode, str] = Field(
        default=0, description="The seed for noise generation."
    )
    steps: int | GraphNode | tuple[GraphNode, str] = Field(
        default=20, description="The number of steps to use during sampling."
    )
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(
        default=8.0, description="The configuration value for the sampler."
    )
    sampler_name: SamplerEnum | GraphNode | tuple[GraphNode, str] = Field(
        default=SamplerEnum("ddim"), description="The name of the sampler to use."
    )
    scheduler: SchedulerEnum | GraphNode | tuple[GraphNode, str] = Field(
        default=SchedulerEnum("normal"), description="The scheduler to use."
    )
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(
        default=Conditioning(type="comfy.conditioning"),
        description="The positive conditioning influence.",
    )
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(
        default=Conditioning(type="comfy.conditioning"),
        description="The negative conditioning influence.",
    )
    latent_image: Latent | GraphNode | tuple[GraphNode, str] = Field(
        default=Latent(type="comfy.latent"), description="The starting latent image."
    )
    start_at_step: int | GraphNode | tuple[GraphNode, str] = Field(
        default=0, description="The step at which to start the sampling process."
    )
    end_at_step: int | GraphNode | tuple[GraphNode, str] = Field(
        default=10000, description="The step at which to end the sampling process."
    )
    return_with_leftover_noise: EnableDisable | GraphNode | tuple[GraphNode, str] = (
        Field(
            default=EnableDisable("disable"),
            description="Whether to return with leftover noise or not.",
        )
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.sampling.KSamplerAdvanced"
