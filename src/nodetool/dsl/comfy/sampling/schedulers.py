from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.sampling import SchedulerEnum

class BasicScheduler(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to use.')
    scheduler: SchedulerEnum | GraphNode | tuple[GraphNode, str] = Field(default=SchedulerEnum('normal'), description='The scheduler name.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.BasicScheduler"



class ExponentialScheduler(GraphNode):
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.ExponentialScheduler"



class KarrasScheduler(GraphNode):
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')
    rho: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='The rho value.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.KarrasScheduler"



class PolyexponentialScheduler(GraphNode):
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to compute the sigmas.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')
    rho: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The rho parameter for the scheduler.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.PolyexponentialScheduler"



class SDTurboScheduler(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model for which to use the scheduler.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of steps for the scheduler.')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The denoising factor to apply in the scheduler.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.SDTurboScheduler"



class VPScheduler(GraphNode):
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to compute the sigmas.')
    beta_d: float | GraphNode | tuple[GraphNode, str] = Field(default=19.9, description='beta_d parameter for the VP scheduler.')
    beta_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='beta_min parameter for the VP scheduler.')
    eps_s: float | GraphNode | tuple[GraphNode, str] = Field(default=0.001, description='eps_s parameter for the VP scheduler.')
    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.VPScheduler"


