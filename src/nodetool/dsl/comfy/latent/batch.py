from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentBatch(GraphNode):
    """
    The Latent Batch node can be used to batch latent images.
    """

    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The first set of latent samples for the batch process.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The second set of latent samples for the batch process.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.LatentBatch"



class LatentFromBatch(GraphNode):
    """
    The Latent From Batch node can be used to pick a slice from a batch of latents. This is useful when a specific latent image or images inside the batch need to be isolated in the workflow.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The batch of latent samples.')
    batch_index: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The index of the sample in the batch.')
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The length of latent samples to extract.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.LatentFromBatch"



class RepeatLatentBatch(GraphNode):
    """
    The Repeat Latent Batch node can be used to repeat a batch of latent images. This can e.g. be used to create multiple variations of an image in an image to image workflow.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to repeat.')
    amount: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The amount of times to repeat each sample.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.RepeatLatentBatch"


