from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CLIPTextEncodeFlux(GraphNode):
    """
    The CLIP Text Encode Flux node can be used to encode a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images.
    """

    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP model to use for encoding.')
    clip_l: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to encode.')
    t5xxl: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to encode.')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The guidance value to use for encoding.')

    @classmethod
    def get_node_type(cls): return "comfy.flux.CLIPTextEncodeFlux"



class FluxGuidance(GraphNode):
    """
    The Flux Guidance node can be used to append guidance to a conditioning.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to append guidance to.')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The guidance value to append.')

    @classmethod
    def get_node_type(cls): return "comfy.flux.FluxGuidance"


