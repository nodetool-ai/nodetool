from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentBatch(GraphNode):
    samples1: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The first set of latent samples for the batch process.')
    samples2: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The second set of latent samples for the batch process.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.LatentBatch"



class LatentFromBatch(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The batch of latent samples.')
    batch_index: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The index of the sample in the batch.')
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The length of latent samples to extract.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.LatentFromBatch"



class RepeatLatentBatch(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to repeat.')
    amount: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The amount of times to repeat each sample.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.batch.RepeatLatentBatch"


