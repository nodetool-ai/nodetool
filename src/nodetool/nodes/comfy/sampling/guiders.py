

from pydantic import Field
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import Conditioning, Guider, UNet


class BasicGuider(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    conditioning: Conditioning = Field(default=Conditioning(), description="The conditioning.")
    
    @classmethod
    def return_type(cls):
        return {"guider": Guider}


class CFGGuider(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    positive: str = Field(default="", description="The positive conditioning.")
    negative: str = Field(default="", description="The negative conditioning.")
    cfg: float = Field(default=8.0, description="The cfg (classifier-free guidance) parameter.")
    
    @classmethod
    def return_type(cls):
        return {"guider": Guider}
    

class DualCFGGuider(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    cond1: Conditioning = Field(default=Conditioning(), description="The first conditioning.")
    cond2: Conditioning = Field(default=Conditioning(), description="The second conditioning.")
    negative: str = Field(default="", description="The negative conditioning.")
    cfg_conds: float = Field(default=8.0, description="The cfg (classifier-free guidance) parameter.")
    cfg_conds2_negative: float = Field(default=8.0, description="The cfg (classifier-free guidance) parameter for the second conditioning.")
    
    
    @classmethod
    def return_type(cls):
        return {"guider": Guider}