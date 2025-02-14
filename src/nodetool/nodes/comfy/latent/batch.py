from pydantic import Field
from nodetool.metadata.types import Latent
from nodetool.nodes.comfy.comfy_node import ComfyNode
import nodes
import comfy_extras.nodes_latent


class LatentFromBatch(ComfyNode):
    """
    The Latent From Batch node can be used to pick a slice from a batch of latents. This is useful when a specific latent image or images inside the batch need to be isolated in the workflow.
    """

    _comfy_class = nodes.LatentFromBatch

    samples: Latent = Field(
        default=Latent(), description="The batch of latent samples."
    )
    batch_index: int = Field(
        default=0, description="The index of the sample in the batch.", ge=0, le=63
    )
    length: int = Field(
        default=1, description="The length of latent samples to extract.", ge=1, le=64
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class RepeatLatentBatch(ComfyNode):
    """
    The Repeat Latent Batch node can be used to repeat a batch of latent images. This can e.g. be used to create multiple variations of an image in an image to image workflow.
    """

    _comfy_class = nodes.RepeatLatentBatch

    samples: Latent = Field(
        default=Latent(), description="The latent samples to repeat."
    )
    amount: int = Field(
        default=1, description="The amount of times to repeat each sample."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentBatch(ComfyNode):
    """
    The Latent Batch node can be used to batch latent images.
    """

    _comfy_class = comfy_extras.nodes_latent.LatentBatch

    samples1: Latent = Field(
        default=Latent(),
        description="The first set of latent samples for the batch process.",
    )
    samples2: Latent = Field(
        default=Latent(),
        description="The second set of latent samples for the batch process.",
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
