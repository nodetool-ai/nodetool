from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentAdd(GraphNode):
    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first set of latent samples to add.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second set of latent samples to add.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentAdd"



class LatentInterpolate(GraphNode):
    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first set of latent samples for interpolation.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second set of latent samples for interpolation.')
    ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ratio for interpolation, controlling the blend between samples1 and samples2.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentInterpolate"



class LatentMultiply(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to multiply.')
    multiplier: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The multiplier for the latent samples.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentMultiply"



class LatentSubtract(GraphNode):
    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first set of latent samples to subtract from.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second set of latent samples to subtract.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentSubtract"


