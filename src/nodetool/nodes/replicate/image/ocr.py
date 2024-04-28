from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class TextExtractOCR(ReplicateNode):
    """A simple OCR Model that can easily extract text from an image."""

    def replicate_model_id(self):
        return "abiruyt/text-extract-ocr:a524caeaa23495bc9edc805ab08ab5fe943afd3febed884a4f3747aa32e9cd61"

    def get_hardware(self):
        return "CPU"

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Image to process")


class LatexOCR(ReplicateNode):
    """Optical character recognition to turn images of latex equations into latex format."""

    def replicate_model_id(self):
        return "mickeybeurskens/latex-ocr:b3278fae4c46eb2798804fc66e721e6ce61a450d072041a7e402b2c77805dcc3"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return str

    image_path: str | None = Field(
        title="Image Path", description="Input image", default=None
    )
