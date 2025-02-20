from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class FlipSigmas(GraphNode):
    """
    Flip an array of sigmas.
    """

    sigmas: Sigmas | GraphNode | tuple[GraphNode, str] = Field(default=Sigmas(type='comfy.sigmas', data=None), description='The array of sigmas to flip.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.sigmas.FlipSigmas"



class SplitSigmas(GraphNode):
    """
    Split an array of sigmas into two arrays.
    """

    sigmas: Sigmas | GraphNode | tuple[GraphNode, str] = Field(default=Sigmas(type='comfy.sigmas', data=None), description='The array of sigmas to split.')
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The specific step at which to split the sigmas array.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.sigmas.SplitSigmas"


