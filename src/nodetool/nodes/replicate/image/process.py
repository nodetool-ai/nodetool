from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class RemoveBackground(ReplicateNode):
    """Remove images background"""

    def replicate_model_id(self):
        return "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003"

    def get_hardware(self):
        return "Nvidia A40 GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image")


class ModNet(ReplicateNode):
    """A deep learning approach to remove background & adding new background image"""

    def replicate_model_id(self):
        return "pollinations/modnet:da7d45f3b836795f945f221fc0b01a6d3ab7f5e163f13208948ad436001e2255"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="input image")
