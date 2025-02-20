from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class StableCascade_EmptyLatentImage(GraphNode):
    """
    The Stable Cascade Empty Latent Image node can be used to create an empty latent image.
    """

    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The width of the latent image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The height of the latent image.')
    compression: int | GraphNode | tuple[GraphNode, str] = Field(default=42, description='The compression factor for the latent image.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size for the latent images.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.stable_cascade.StableCascade_EmptyLatentImage"



class StableCascade_StageB_Conditioning(GraphNode):
    """
    The Stable Cascade Stage B Conditioning node can be used to condition the stage B latent image.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The input conditioning.')
    stage_c: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The stage C latent.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.stable_cascade.StableCascade_StageB_Conditioning"



class StableCascade_StageC_VAEEncode(GraphNode):
    """
    The Stable Cascade Stage C VAE Encode node can be used to encode an image into a latent image.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to encode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE model to use for encoding.')
    compression: int | GraphNode | tuple[GraphNode, str] = Field(default=42, description='The compression factor for the latent image.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.stable_cascade.StableCascade_StageC_VAEEncode"



class StableCascade_SuperResolutionControlnet(GraphNode):
    """
    The Stable Cascade Super Resolution Controlnet node can be used to encode an image into a latent image.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image for super-resolution.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE model to use for encoding.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.stable_cascade.StableCascade_SuperResolutionControlnet"


