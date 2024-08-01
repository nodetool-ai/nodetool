from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.multimodal import FeaturesExtractionModelId

class FeaturesExtraction(GraphNode):
    model: FeaturesExtractionModelId | GraphNode | tuple[GraphNode, str] = Field(default=FeaturesExtractionModelId('sentence-transformers/all-mpnet-base-v2'), description='The model ID to use for feature extraction')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to extract features from')
    @classmethod
    def get_node_type(cls): return "huggingface.multimodal.FeaturesExtraction"


from nodetool.nodes.huggingface.multimodal import ImageFeatureExtractionModelId

class ImageFeatureExtraction(GraphNode):
    model: ImageFeatureExtractionModelId | GraphNode | tuple[GraphNode, str] = Field(default=ImageFeatureExtractionModelId('microsoft/resnet-50'), description='The model ID to use for image feature extraction')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to extract features from')
    @classmethod
    def get_node_type(cls): return "huggingface.multimodal.ImageFeatureExtraction"


from nodetool.nodes.huggingface.multimodal import ImageToTextModelId

class ImageToText(GraphNode):
    model: ImageToTextModelId | GraphNode | tuple[GraphNode, str] = Field(default=ImageToTextModelId('microsoft/git-base-coco'), description='The model ID to use for image-to-text generation')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to generate text from')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The maximum number of tokens to generate')
    @classmethod
    def get_node_type(cls): return "huggingface.multimodal.ImageToText"


from nodetool.nodes.huggingface.multimodal import MaskGenerationModelId

class MaskGeneration(GraphNode):
    model: MaskGenerationModelId | GraphNode | tuple[GraphNode, str] = Field(default=MaskGenerationModelId('facebook/sam-vit-base'), description='The model ID to use for mask generation')
    inputs: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to generate masks for')
    points_per_side: int | GraphNode | tuple[GraphNode, str] = Field(default=32, description='Number of points to be sampled along each side of the image')
    @classmethod
    def get_node_type(cls): return "huggingface.multimodal.MaskGeneration"


from nodetool.nodes.huggingface.multimodal import VisualQuestionAnsweringModelId

class VisualQuestionAnswering(GraphNode):
    model: VisualQuestionAnsweringModelId | GraphNode | tuple[GraphNode, str] = Field(default=VisualQuestionAnsweringModelId('microsoft/git-base-textvqa'), description='The model ID to use for visual question answering')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to analyze')
    question: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The question to be answered about the image')
    @classmethod
    def get_node_type(cls): return "huggingface.multimodal.VisualQuestionAnswering"


