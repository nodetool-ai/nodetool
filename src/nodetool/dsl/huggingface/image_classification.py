from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ImageClassifier(GraphNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    """

    model: HFImageClassification | GraphNode | tuple[GraphNode, str] = Field(default=HFImageClassification(type='hf.image_classification', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the classification')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to classify')

    @classmethod
    def get_node_type(cls): return "huggingface.image_classification.ImageClassifier"



class ZeroShotImageClassifier(GraphNode):
    """
    Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets
    """

    model: HFZeroShotImageClassification | GraphNode | tuple[GraphNode, str] = Field(default=HFZeroShotImageClassification(type='hf.zero_shot_image_classification', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the classification')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to classify')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The candidate labels to classify the image against, separated by commas')

    @classmethod
    def get_node_type(cls): return "huggingface.image_classification.ZeroShotImageClassifier"


