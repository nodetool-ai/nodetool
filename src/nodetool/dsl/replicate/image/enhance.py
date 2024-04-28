from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CodeFormer(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    upscale: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='The final upsampling scale of the image')
    face_upsample: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Upsample restored faces for high-resolution AI-created images')
    background_enhance: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Enhance background image with Real-ESRGAN')
    codeformer_fidelity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Balance the quality (lower number) and fidelity (higher number).')
    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.CodeFormer"


from nodetool.nodes.replicate.image.enhance import Model

class Maxim(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image.')
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Choose a model.')
    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.Maxim"



class OldPhotosRestoration(GraphNode):
    HR: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='whether the input image is high-resolution')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='input image.')
    with_scratch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='whether the input image is scratched')
    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.OldPhotosRestoration"


