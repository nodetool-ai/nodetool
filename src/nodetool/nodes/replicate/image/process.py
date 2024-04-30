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
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/2hczaMwD9xrsIR8h3Cl8iYGbHaCdFhIOMZ0LfoYfHlKuuIBQA/out.png",
            "created_at": "2022-11-18T00:55:22.939155Z",
            "description": "Remove images background",
            "github_url": "https://github.com/chenxwh/rembg/tree/replicate",
            "license_url": "https://github.com/danielgatis/rembg/blob/main/LICENSE.txt",
            "name": "rembg",
            "owner": "cjwbw",
            "paper_url": None,
            "run_count": 5271846,
            "url": "https://replicate.com/cjwbw/rembg",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

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
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/bb0ab3e4-5efa-446f-939a-23e78f2b82de/output.png",
            "created_at": "2022-11-19T04:56:59.860128Z",
            "description": "A deep learning approach to remove background & adding new background image",
            "github_url": "https://github.com/pollinations/MODNet-BGRemover",
            "license_url": None,
            "name": "modnet",
            "owner": "pollinations",
            "paper_url": "https://arxiv.org/pdf/2011.11961.pdf",
            "run_count": 518632,
            "url": "https://replicate.com/pollinations/modnet",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="input image")
