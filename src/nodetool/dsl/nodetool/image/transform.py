from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AdaptiveContrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the contrast for.')
    clip_limit: float | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description='Clip limit for adaptive contrast.')
    grid_size: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Grid size for adaptive contrast.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.AdaptiveContrast"



class AutoContrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the contrast for.')
    cutoff: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Cutoff for autocontrast.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.AutoContrast"



class Blur(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to blur.')
    radius: float | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description='Blur radius.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Blur"



class Brightness(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the brightness for.')
    factor: float | int | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the brightness. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Brightness"



class Canny(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to canny.')
    low_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Low threshold.')
    high_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='High threshold.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Canny"



class Color(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Color"



class Contour(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to contour.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Contour"



class Contrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Contrast"



class ConvertToGrayscale(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to convert.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.ConvertToGrayscale"



class Crop(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to crop.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The left coordinate.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The top coordinate.')
    right: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The right coordinate.')
    bottom: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The bottom coordinate.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Crop"



class Detail(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to detail.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Detail"



class EdgeEnhance(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to edge enhance.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.EdgeEnhance"



class Emboss(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to emboss.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Emboss"



class Equalize(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to equalize.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Equalize"



class Expand(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to expand.')
    border: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Border size.')
    fill: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Fill color.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Expand"



class FindEdges(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to find edges.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.FindEdges"



class Fit(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to fit.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width to fit to.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height to fit to.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Fit"


from nodetool.nodes.nodetool.image.transform import ChannelEnum

class GetChannel(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to get the channel from.')
    channel: ChannelEnum | GraphNode | tuple[GraphNode, str] = Field(default=ChannelEnum('R'), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.GetChannel"



class Invert(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the brightness for.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Invert"



class Posterize(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to posterize.')
    bits: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of bits to posterize to.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Posterize"



class RankFilter(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to rank filter.')
    size: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter size.')
    rank: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter rank.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.RankFilter"



class Resize(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to resize.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target width.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target height.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Resize"



class Scale(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to scale.')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale factor.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Scale"



class Sharpen(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to sharpen.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Sharpen"



class Sharpness(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Sharpness"



class Smooth(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to smooth.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Smooth"



class Solarize(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to solarize.')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='Threshold for solarization.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.Solarize"



class UnsharpMask(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to unsharp mask.')
    radius: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Unsharp mask radius.')
    percent: int | GraphNode | tuple[GraphNode, str] = Field(default=150, description='Unsharp mask percent.')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Unsharp mask threshold.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.transform.UnsharpMask"


