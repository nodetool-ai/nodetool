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
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/9d31603c-2266-4705-9d2d-01b4f6bff653/IM0077782.png",
            "created_at": "2023-10-19T13:20:00.740943Z",
            "description": "A simple OCR Model that can easily extract text from an image.",
            "github_url": None,
            "license_url": None,
            "name": "text-extract-ocr",
            "owner": "abiruyt",
            "paper_url": None,
            "run_count": 17244350,
            "url": "https://replicate.com/abiruyt/text-extract-ocr",
            "visibility": "public",
            "hardware": "CPU",
        }

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
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/980ae6b5-4ab8-417a-8148-b244f4ae0493/latex.png",
            "created_at": "2023-11-06T10:13:47.198885Z",
            "description": "Optical character recognition to turn images of latex equations into latex format.",
            "github_url": "https://github.com/mickeybeurskens/LaTeX-OCR",
            "license_url": "https://github.com/mickeybeurskens/LaTeX-OCR/blob/main/LICENSE",
            "name": "latex-ocr",
            "owner": "mickeybeurskens",
            "paper_url": None,
            "run_count": 467,
            "url": "https://replicate.com/mickeybeurskens/latex-ocr",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image_path: str | None = Field(
        title="Image Path", description="Input image", default=None
    )
