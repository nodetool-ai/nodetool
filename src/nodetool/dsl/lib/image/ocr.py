from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.lib.image.ocr

class PaddleOCRNode(GraphNode):
    """
    Performs Optical Character Recognition (OCR) on images using PaddleOCR.
    image, text, ocr, document

    Use cases:
    - Text extraction from images
    - Document digitization
    - Receipt/invoice processing
    - Handwriting recognition
    """

    OCRLanguage: typing.ClassVar[type] = nodetool.nodes.lib.image.ocr.PaddleOCRNode.OCRLanguage
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to perform OCR on')
    language: nodetool.nodes.lib.image.ocr.PaddleOCRNode.OCRLanguage = Field(default=OCRLanguage.ENGLISH, description='Language code for OCR')

    @classmethod
    def get_node_type(cls): return "lib.image.ocr.PaddleOCR"


