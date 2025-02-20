from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class EmptyLatentImage(GraphNode):
    """
    The Empty Latent Image node can be used to create a new set of empty latent images. These latents can then be used inside e.g. a text2image workflow by noising and denoising them with a sampler node.
    """

    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the latent image to generate.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the latent image to generate.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size of the latent image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.EmptyLatentImage"



class EmptySD3LatentImage(GraphNode):
    """
    The Empty SD3 Latent Image node can be used to create a new set of empty latent images. These latents can then be used inside e.g. a text2image workflow by noising and denoising them with a sampler node.
    """

    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The width of the latent image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The height of the latent image.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.EmptySD3LatentImage"



class LatentBlend(GraphNode):
    """
    The Latent Blend node can be used to blend two sets of latent samples. This allows for smooth transitions or combinations of different latent representations.
    """

    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first set of latent samples.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second set of latent samples.')
    blend_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The blend factor between samples.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentBlend"



class LatentComposite(GraphNode):
    """
    The Latent Composite node can be used to paste one latent into another.
    """

    samples_to: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first latent sample.')
    samples_from: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second latent sample.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate for compositing.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate for compositing.')
    feather: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The feather amount for compositing edges.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentComposite"



class LatentCompositeMasked(GraphNode):
    """
    The Latent Composite Masked node can be used to paste a masked latent into another.
    """

    destination: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The destination latent.')
    source: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The source latent.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    resize_source: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to resize the source.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to use.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentCompositeMasked"



class LatentCrop(GraphNode):
    """
    The Crop Latent node can be used to crop latent images.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate for cropping.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate for cropping.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the crop.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentCrop"



class LatentFlip(GraphNode):
    """
    The Flip Latent node can be used to flip latent images.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to flip.')
    horizontal: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to flip horizontally.')
    vertical: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to flip vertically.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentFlip"



class LatentRotate(GraphNode):
    """
    The Rotate Latent node can be used to rotate latent images.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to rotate.')
    angle: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The angle to rotate the latent by.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentRotate"


import nodetool.nodes.comfy.latent
import nodetool.nodes.comfy.latent

class LatentUpscale(GraphNode):
    """
    The Upscale Latent node can be used to resize latent images.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to upscale.')
    upscale_method: nodetool.nodes.comfy.latent.LatentUpscale.UpScaleMethod = Field(default=nodetool.nodes.comfy.latent.LatentUpscale.UpScaleMethod('nearest_exact'), description='The method to use for upscaling.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target width after upscaling.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target height after upscaling.')
    crop: nodetool.nodes.comfy.latent.LatentUpscale.CropMethod = Field(default=nodetool.nodes.comfy.latent.LatentUpscale.CropMethod('disabled'), description='The method to use for cropping.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentUpscale"


import nodetool.nodes.comfy.latent

class LatentUpscaleBy(GraphNode):
    """
    The Upscale Latent node can be used to resize latent images.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to upscale.')
    upscale_method: nodetool.nodes.comfy.latent.LatentUpscaleBy.UpScaleMethod = Field(default=nodetool.nodes.comfy.latent.LatentUpscaleBy.UpScaleMethod('nearest_exact'), description='The method to use for upscaling.')
    scale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=1.5, description='The factor by which to scale.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.LatentUpscaleBy"



class SaveLatent(GraphNode):
    """
    Save a latent to a file in the specified folder.
    latent, save, file, storage

    Use cases:
    - Persist latent data for later use
    - Export latent results from a workflow
    - Save intermediate latent outputs for debugging
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to save.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='The folder to save the latent in.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='latent.latent', description='The name of the asset to save.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.SaveLatent"



class VAEDecode(GraphNode):
    """
    The VAE Decode node can be used to decode latent space images back into pixel space images, using the provided VAE.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to decode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE to use.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEDecode"



class VAEDecodeTiled(GraphNode):
    """
    The VAE Decode node can be used to decode latent space images back into pixel space images, using the provided VAE.
    The tiled version of the node is useful for decoding large images that would otherwise exceed the memory limits of the system.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to decode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE to use for decoding.')
    tile_size: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The size of the tiles to decode.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEDecodeTiled"



class VAEEncode(GraphNode):
    """
    The VAE Encode node can be used to encode pixel space images into latent space images, using the provided VAE.
    """

    pixels: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to encode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE to use.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncode"



class VAEEncodeForInpaint(GraphNode):
    """
    The VAE Encode for Inpaint node can be used to encode pixel space images into latent space specifically for inpainting tasks. It takes into account a mask to focus the encoding on specific areas of the image.
    """

    pixels: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image pixels to encode for inpainting.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE to use for encoding.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to apply for inpainting.')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Amount to grow the mask by.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncodeForInpaint"



class VAEEncodeTiled(GraphNode):
    """
    The VAE Encode Tiled node can be used to encode pixel space images into latent space images using a tiled approach. This is useful for encoding large images that might exceed memory limits when processed all at once.
    """

    pixels: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image pixels to encode.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE to use for encoding.')
    tile_size: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The size of the tiles to encode.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.VAEEncodeTiled"


