from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentAdd(GraphNode):
    """
    The Latent Add node can be used to add two sets of latent samples together. This operation allows for combining different latent representations, potentially creating interesting hybrid results.
    """

    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first set of latent samples to add.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second set of latent samples to add.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentAdd"



class LatentInterpolate(GraphNode):
    """
    The Latent Interpolate node can be used to create a smooth transition between two sets of latent samples. This allows for blending different latent representations, potentially creating intermediate results.
    """

    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first set of latent samples for interpolation.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second set of latent samples for interpolation.')
    ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ratio for interpolation, controlling the blend between samples1 and samples2.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentInterpolate"



class LatentMultiply(GraphNode):
    """
    The Latent Multiply node can be used to scale the values of latent samples by a specified multiplier. This operation can amplify or diminish certain features in the latent representation.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to multiply.')
    multiplier: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The multiplier for the latent samples.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentMultiply"



class LatentSubtract(GraphNode):
    """
    The Latent Subtract node can be used to subtract one set of latent samples from another. This operation can be useful for removing certain features or characteristics represented in the latent space.
    """

    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first set of latent samples to subtract from.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second set of latent samples to subtract.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.advanced.LatentSubtract"


