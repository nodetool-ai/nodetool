from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.ipadapter

class IPAdapterApply(GraphNode):
    """
    The IPAdapter Apply node can be used to apply an IPAdapter to a model.
    """

    ipadapter: IPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapter(type='comfy.ip_adapter', name='', model=None), description='The IPAdapter to apply.')
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision', name='', model=None), description='The CLIP vision to use.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to use.')
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply the IPAdapter to.')
    weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight of the application.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_type: nodetool.nodes.comfy.ipadapter.IPAdapterApply.WeightTypeEnum = Field(default=nodetool.nodes.comfy.ipadapter.IPAdapterApply.WeightTypeEnum('original'), description='The type of weight to apply.')
    start_at: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The starting point for applying the IPAdapter.')
    end_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ending point for applying the IPAdapter.')
    unfold_batch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to unfold the batch during the application.')
    attn_mask: nodetool.metadata.types.Mask | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The optional attention mask to use (if any).')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterApply"


import nodetool.nodes.comfy.ipadapter

class IPAdapterApplyEncoded(GraphNode):
    """
    The IPAdapter Apply Encoded node can be used to apply an encoded IPAdapter to a model.
    """

    ipadapter: IPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapter(type='comfy.ip_adapter', name='', model=None), description='The IPAdapter to apply.')
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision', name='', model=None), description='The CLIP vision to use.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to use.')
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply the IPAdapter to.')
    weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight of the application.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_type: nodetool.nodes.comfy.ipadapter.IPAdapterApplyEncoded.WeightTypeEnum = Field(default=nodetool.nodes.comfy.ipadapter.IPAdapterApplyEncoded.WeightTypeEnum('original'), description='The type of weight to apply.')
    start_at: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The starting point for applying the IPAdapter.')
    end_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ending point for applying the IPAdapter.')
    unfold_batch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to unfold the batch during the application.')
    attn_mask: nodetool.metadata.types.Mask | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The optional attention mask to use (if any).')
    embeds: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds', data=None), description='The encoded embeddings to apply.')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterApplyEncoded"



class IPAdapterBatchEmbeds(GraphNode):
    """
    The IPAdapter Batch Embeds node can be used to batch two sets of embeddings.
    """

    embed1: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds', data=None), description='The first set of embeddings.')
    embed2: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds', data=None), description='The second set of embeddings.')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterBatchEmbeds"



class IPAdapterEncoder(GraphNode):
    """
    The IPAdapter Encoder node can be used to encode an image into an embedding that can be used to guide the diffusion model towards generating specific images.
    """

    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision', name='', model=None), description='The CLIP vision to use.')
    image_1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The first image to encode.')
    ipadapter_plus: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to use IPAdapter+ enhancements.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_1: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the first image.')
    image_2: nodetool.metadata.types.ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The second image to encode (optional).')
    image_3: nodetool.metadata.types.ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The third image to encode (optional).')
    image_4: nodetool.metadata.types.ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The fourth image to encode (optional).')
    weight_2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the second image (optional).')
    weight_3: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the third image (optional).')
    weight_4: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the fourth image (optional).')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterEncoder"



class IPAdapterSaveEmbeds(GraphNode):
    """
    The IPAdapter Save Embeds node can be used to save an embedding to a file.
    """

    embeds: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds', data=None), description='The embeddings to save.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='embeds/IPAdapter', description='The prefix for the filename to save the embeddings.')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterSaveEmbeds"


import nodetool.nodes.comfy.ipadapter
import nodetool.nodes.comfy.ipadapter

class PrepImageForClipVision(GraphNode):
    """
    The Prep Image For Clip Vision node can be used to prepare an image for use with a CLIPVision model.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to prepare.')
    interpolation: nodetool.nodes.comfy.ipadapter.PrepImageForClipVision.InterpolationMethod = Field(default=nodetool.nodes.comfy.ipadapter.PrepImageForClipVision.InterpolationMethod('LANCZOS'), description='The interpolation method to use.')
    crop_position: nodetool.nodes.comfy.ipadapter.PrepImageForClipVision.CropPosition = Field(default=nodetool.nodes.comfy.ipadapter.PrepImageForClipVision.CropPosition('center'), description='The crop position to use.')
    sharpening: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of sharpening to apply.')

    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.PrepImageForClipVision"


