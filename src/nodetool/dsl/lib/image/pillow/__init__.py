from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Blend(GraphNode):
    """
    Blend two images with adjustable alpha mixing.
    blend, mix, fade, transition

    Use cases:
    - Create smooth transitions between images
    - Adjust opacity of overlays
    - Combine multiple exposures or effects
    """

    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The first image to blend.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The second image to blend.')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The mix ratio.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.Blend"



class Composite(GraphNode):
    """
    Combine two images using a mask for advanced compositing.
    composite, mask, blend, layering

    Use cases:
    - Create complex image compositions
    - Apply selective blending or effects
    - Implement advanced photo editing techniques
    """

    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The first image to composite.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The second image to composite.')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask to composite with.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.Composite"


