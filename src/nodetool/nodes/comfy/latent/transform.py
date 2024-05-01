from enum import Enum
from pydantic import Field
from nodetool.metadata.types import Latent
from nodetool.common.comfy_node import ComfyNode


class Rotation(str, Enum):
    NONE = "none"
    _90_DEGREES = "90 degrees"
    _180_DEGREES = "180 degrees"
    _270_DEGREES = "270 degrees"


class LatentRotate(ComfyNode):
    samples: Latent = Field(
        default=Latent(), description="The latent samples to rotate."
    )
    rotation: Rotation = Field(
        default=Rotation.NONE, description="The degree of rotation to apply."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class FlipMethod(str, Enum):
    HORIZONTAL = "y-axis: horizontally"
    VERTICAL = "x-axis: vertically"


class LatentFlip(ComfyNode):
    samples: Latent = Field(default=Latent(), description="The latent samples to flip.")
    flip_method: FlipMethod = Field(
        default=FlipMethod.HORIZONTAL, description="The method to use for flipping."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentCrop(ComfyNode):
    samples: Latent = Field(default=Latent(), description="The latent samples to crop.")
    width: int = Field(default=512, description="The width of the crop.")
    height: int = Field(default=512, description="The height of the crop.")
    x: int = Field(
        default=0,
        description="The x-coordinate for the top-left corner of the crop area.",
    )
    y: int = Field(
        default=0,
        description="The y-coordinate for the top-left corner of the crop area.",
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
