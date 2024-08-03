from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.image import DepthEstimationModelId

class DepthEstimation(GraphNode):
    model: DepthEstimationModelId | GraphNode | tuple[GraphNode, str] = Field(default=DepthEstimationModelId('LiheYoung/depth-anything-base-hf'), description='The model ID to use for depth estimation')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image for depth estimation')
    @classmethod
    def get_node_type(cls): return "huggingface.image.DepthEstimation"


from nodetool.nodes.huggingface.image import ImageClassifierModelId

class ImageClassifier(GraphNode):
    model: ImageClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=ImageClassifierModelId('google/vit-base-patch16-224'), description='The model ID to use for the classification')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to classify')
    @classmethod
    def get_node_type(cls): return "huggingface.image.ImageClassifier"


from nodetool.nodes.huggingface.image import ImageToImageModelId

class ImageToImage(GraphNode):
    model: ImageToImageModelId | GraphNode | tuple[GraphNode, str] = Field(default=ImageToImageModelId('caidas/swin2SR-classical-sr-x2-64'), description='The model ID to use for the image-to-image transformation')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text prompt to guide the image transformation (if applicable)')
    @classmethod
    def get_node_type(cls): return "huggingface.image.ImageToImage"


from nodetool.nodes.huggingface.image import ObjectDetectionModelId

class ObjectDetection(GraphNode):
    model: ObjectDetectionModelId | GraphNode | tuple[GraphNode, str] = Field(default=ObjectDetectionModelId('facebook/detr-resnet-50'), description='The model ID to use for object detection')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image for object detection')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='Minimum confidence score for detected objects')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='The number of top predictions to return')
    @classmethod
    def get_node_type(cls): return "huggingface.image.ObjectDetection"


from nodetool.nodes.huggingface.image import SegmentationModelId

class Segmentation(GraphNode):
    model: SegmentationModelId | GraphNode | tuple[GraphNode, str] = Field(default=SegmentationModelId('nvidia/segformer-b3-finetuned-ade-512-512'), description='The model ID to use for the segmentation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to segment')
    @classmethod
    def get_node_type(cls): return "huggingface.image.Segmentation"


from nodetool.nodes.huggingface.image import ZeroShotImageClassifierModelId

class ZeroShotImageClassifier(GraphNode):
    model: ZeroShotImageClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=ZeroShotImageClassifierModelId('openai/clip-vit-large-patch14'), description='The model ID to use for the classification')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to classify')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The candidate labels to classify the image against, separated by commas')
    @classmethod
    def get_node_type(cls): return "huggingface.image.ZeroShotImageClassifier"


from nodetool.nodes.huggingface.image import ZeroShotObjectDetectionModelId

class ZeroShotObjectDetection(GraphNode):
    model: ZeroShotObjectDetectionModelId | GraphNode | tuple[GraphNode, str] = Field(default=ZeroShotObjectDetectionModelId('google/owlv2-base-patch16'), description='The model ID to use for object detection')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image for object detection')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Minimum confidence score for detected objects')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='The number of top predictions to return')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The candidate labels to detect in the image, separated by commas')
    @classmethod
    def get_node_type(cls): return "huggingface.image.ZeroShotObjectDetection"


