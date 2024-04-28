from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatexOCR(GraphNode):
    image_path: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.ocr.LatexOCR"



class TextExtractOCR(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Image to process')
    @classmethod
    def get_node_type(cls): return "replicate.image.ocr.TextExtractOCR"


