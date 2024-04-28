from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.ipadapter import WeightTypeEnum

class IPAdapterApply(GraphNode):
    ipadapter: IPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapter(type='comfy.ip_adapter'), description='The IPAdapter to apply.')
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision'), description='The CLIP vision to use.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to use.')
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to apply the IPAdapter to.')
    weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight of the application.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_type: WeightTypeEnum | GraphNode | tuple[GraphNode, str] = Field(default=WeightTypeEnum('original'), description='The type of weight to apply.')
    start_at: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The starting point for applying the IPAdapter.')
    end_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ending point for applying the IPAdapter.')
    unfold_batch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to unfold the batch during the application.')
    attn_mask: nodetool.metadata.types.Mask | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The optional attention mask to use (if any).')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterApply"


from nodetool.nodes.comfy.ipadapter import WeightTypeEnum

class IPAdapterApplyEncoded(GraphNode):
    ipadapter: IPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapter(type='comfy.ip_adapter'), description='The IPAdapter to apply.')
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision'), description='The CLIP vision to use.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to use.')
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to apply the IPAdapter to.')
    weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight of the application.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_type: WeightTypeEnum | GraphNode | tuple[GraphNode, str] = Field(default=WeightTypeEnum('original'), description='The type of weight to apply.')
    start_at: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The starting point for applying the IPAdapter.')
    end_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The ending point for applying the IPAdapter.')
    unfold_batch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to unfold the batch during the application.')
    attn_mask: nodetool.metadata.types.Mask | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The optional attention mask to use (if any).')
    embeds: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds'), description='The encoded embeddings to apply.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterApplyEncoded"


from nodetool.nodes.comfy.ipadapter import WeightTypeEnum

class IPAdapterApplyFaceID(GraphNode):
    ipadapter: IPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapter(type='comfy.ip_adapter'), description='The IPAdapter.')
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision'), description='The CLIP vision.')
    insightface: InsightFace | GraphNode | tuple[GraphNode, str] = Field(default=InsightFace(type='comfy.insight_face'), description='The InsightFace.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to use.')
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to apply the IPAdapter.')
    weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for processing.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The noise level for processing.')
    weight_type: WeightTypeEnum | GraphNode | tuple[GraphNode, str] = Field(default=WeightTypeEnum('original'), description='The weight type to use.')
    start_at: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Start applying from this step (normalized).')
    end_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Ends applying at this step (normalized).')
    faceid_v2: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Flag to use faceId v2 algorithm.')
    weight_v2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for processing with faceId v2.')
    unfold_batch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Flag to unfold batches for processing.')
    attn_mask: nodetool.metadata.types.Mask | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The attention mask.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterApplyFaceID"



class IPAdapterBatchEmbeds(GraphNode):
    embed1: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds'), description='The first set of embeddings.')
    embed2: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds'), description='The second set of embeddings.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterBatchEmbeds"



class IPAdapterEncoder(GraphNode):
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision'), description='The CLIP vision to use.')
    image_1: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The first image to encode.')
    ipadapter_plus: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to use IPAdapter+ enhancements.')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise to apply.')
    weight_1: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the first image.')
    image_2: nodetool.metadata.types.ImageTensor | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The second image to encode (optional).')
    image_3: nodetool.metadata.types.ImageTensor | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The third image to encode (optional).')
    image_4: nodetool.metadata.types.ImageTensor | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The fourth image to encode (optional).')
    weight_2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the second image (optional).')
    weight_3: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the third image (optional).')
    weight_4: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The weight for the fourth image (optional).')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterEncoder"



class IPAdapterModelLoader(GraphNode):
    ipadapter_file: IPAdapterFile | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapterFile(type='comfy.ip_adapter_file', name=''), description='List of available IPAdapter model names.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterModelLoader"



class IPAdapterSaveEmbeds(GraphNode):
    embeds: Embeds | GraphNode | tuple[GraphNode, str] = Field(default=Embeds(type='comfy.embeds'), description='The embeddings to save.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='embeds/IPAdapter', description='The prefix for the filename to save the embeddings.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.IPAdapterSaveEmbeds"


from nodetool.nodes.comfy.ipadapter import ProviderEnum

class InsightFaceLoader(GraphNode):
    provider: ProviderEnum | GraphNode | tuple[GraphNode, str] = Field(default=ProviderEnum('CPU'), description=None)
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.InsightFaceLoader"


from nodetool.nodes.comfy.ipadapter import InterpolationMethod
from nodetool.nodes.comfy.ipadapter import CropPosition

class PrepImageForClipVision(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to prepare.')
    interpolation: InterpolationMethod | GraphNode | tuple[GraphNode, str] = Field(default=InterpolationMethod('LANCZOS'), description='The interpolation method to use.')
    crop_position: CropPosition | GraphNode | tuple[GraphNode, str] = Field(default=CropPosition('center'), description='The crop position to use.')
    sharpening: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of sharpening to apply.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.PrepImageForClipVision"


from nodetool.nodes.comfy.ipadapter import CropPosition

class PrepImageForInsightFace(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to prepare.')
    crop_position: CropPosition | GraphNode | tuple[GraphNode, str] = Field(default=CropPosition('center'), description='The crop position to use.')
    sharpening: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of sharpening to apply.')
    pad_around: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to pad around the image.')
    @classmethod
    def get_node_type(cls): return "comfy.ipadapter.PrepImageForInsightFace"


