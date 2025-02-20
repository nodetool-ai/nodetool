from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.sampling

class BasicScheduler(GraphNode):
    """
    The Basic Scheduler node provides a simple scheduling mechanism for the sampling process.
    It allows selection of different scheduler types and control over steps and denoising.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to use.')
    scheduler: nodetool.nodes.comfy.sampling.BasicScheduler.SchedulerEnum = Field(default=nodetool.nodes.comfy.sampling.BasicScheduler.SchedulerEnum('normal'), description='The scheduler name.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The denoising factor.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.BasicScheduler"



class ExponentialScheduler(GraphNode):
    """
    The Exponential Scheduler node provides an exponential decay schedule for the sampling process,
    which can offer a balance between speed and quality.
    """

    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.ExponentialScheduler"



class KarrasScheduler(GraphNode):
    """
    The Karras Scheduler node implements the Karras et al. noise schedule, which can provide
    improved sampling quality, especially for fewer sampling steps.
    """

    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')
    rho: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='The rho value.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.KarrasScheduler"



class LTXVScheduler(GraphNode):
    """
    Custom scheduler for LTXV models.
    sampling, custom, scheduler, ltxv

    Use cases:
    - Generate custom sigma schedules for sampling
    - Adjust sigmas based on latent tokens
    - Fine-tune sampling parameters for video models
    """

    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of steps.')
    max_shift: float | GraphNode | tuple[GraphNode, str] = Field(default=2.05, description='Maximum shift parameter.')
    base_shift: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='Base shift parameter.')
    stretch: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Stretch sigmas to fit terminal value.')
    terminal: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Terminal value for sigmas.')
    latent: Latent | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional latent input.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.LTXVScheduler"



class PolyexponentialScheduler(GraphNode):
    """
    The Polyexponential Scheduler node implements a more flexible scheduling mechanism,
    allowing for fine-tuned control over the noise schedule through the rho parameter.
    """

    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to compute the sigmas.')
    sigma_max: float | GraphNode | tuple[GraphNode, str] = Field(default=14.614642, description='The maximum sigma value.')
    sigma_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0291675, description='The minimum sigma value.')
    rho: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The rho parameter for the scheduler.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.PolyexponentialScheduler"



class SDTurboScheduler(GraphNode):
    """
    The SDTurbo Scheduler node is designed for very fast inference, often used with
    specific models trained for few-step generation. It's particularly useful for
    real-time or near-real-time applications.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model for which to use the scheduler.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of steps for the scheduler.')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The denoising factor to apply in the scheduler.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.SDTurboScheduler"



class VPScheduler(GraphNode):
    """
    The VP (Variance Preserving) Scheduler node implements a variance preserving stochastic differential equation (SDE) based scheduler, which can provide high-quality results for certain types of models and generation tasks.
    sampling, custom, scheduler

    Use cases:
    - Generate custom sigma schedules for sampling
    - Fine-tune sampling parameters for specific models
    - Experiment with variance preserving noise schedules
    """

    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='The number of steps to compute the sigmas.')
    beta_d: float | GraphNode | tuple[GraphNode, str] = Field(default=19.9, description='beta_d parameter for the VP scheduler.')
    beta_min: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='beta_min parameter for the VP scheduler.')
    eps_s: float | GraphNode | tuple[GraphNode, str] = Field(default=0.001, description='eps_s parameter for the VP scheduler.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.schedulers.VPScheduler"


