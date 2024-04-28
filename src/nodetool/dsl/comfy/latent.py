from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class EmptyLatentImage(GraphNode):
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the latent image to generate.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the latent image to generate.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size of the latent image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.EmptyLatentImage"



class LatentBlend(GraphNode):
    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first set of latent samples.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second set of latent samples.')
    blend_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The blend factor between samples.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentBlend"



class LatentComposite(GraphNode):
    samples_to: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first latent sample.')
    samples_from: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second latent sample.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate for compositing.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate for compositing.')
    feather: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The feather amount for compositing edges.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentComposite"



class LatentCompositeMasked(GraphNode):
    destination: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The destination latent.')
    source: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The source latent.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    resize_source: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to resize the source.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The mask to use.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentCompositeMasked"


from nodetool.nodes.comfy.latent import UpScaleMethod
from nodetool.nodes.comfy.latent import CropMethod

class LatentUpscale(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to upscale.')
    upscale_method: UpScaleMethod | GraphNode | tuple[GraphNode, str] = Field(default=UpScaleMethod('nearest_exact'), description='The method to use for upscaling.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target width after upscaling.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target height after upscaling.')
    crop: CropMethod | GraphNode | tuple[GraphNode, str] = Field(default=CropMethod('disabled'), description='The method to use for cropping.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentUpscale"


from nodetool.nodes.comfy.latent import UpScaleMethod

class LatentUpscaleBy(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to upscale.')
    upscale_method: UpScaleMethod | GraphNode | tuple[GraphNode, str] = Field(default=UpScaleMethod('nearest_exact'), description='The method to use for upscaling.')
    scale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=1.5, description='The factor by which to scale.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentUpscaleBy"



class VAEDecode(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to decode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae'), description='The VAE to use.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEDecode"



class VAEDecodeTiled(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to decode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae'), description='The VAE to use for decoding.')
    tile_size: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The size of the tiles to decode.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEDecodeTiled"



class VAEEncode(GraphNode):
    pixels: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to encode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae'), description='The VAE to use.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncode"



class VAEEncodeForInpaint(GraphNode):
    pixels: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image pixels to encode for inpainting.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae'), description='The VAE to use for encoding.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to apply for inpainting.')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Amount to grow the mask by.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncodeForInpaint"



class VAEEncodeTiled(GraphNode):
    pixels: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image pixels to encode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae'), description='The VAE to use for encoding.')
    tile_size: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The size of the tiles to encode.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncodeTiled"


