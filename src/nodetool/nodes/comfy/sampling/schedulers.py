from pydantic import Field
from nodetool.metadata.types import Latent, Sigmas, UNet
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.comfy.sampling import SchedulerEnum

import comfy_extras.nodes_custom_sampler
import comfy_extras.nodes_lt


class BasicScheduler(ComfyNode):
    """
    The Basic Scheduler node provides a simple scheduling mechanism for the sampling process.
    It allows selection of different scheduler types and control over steps and denoising.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.BasicScheduler

    model: UNet = Field(default=UNet(), description="The model to use.")
    scheduler: SchedulerEnum = Field(
        default=SchedulerEnum.NORMAL, description="The scheduler name."
    )
    steps: int = Field(default=20, description="The number of steps.")
    denoise: float = Field(default=1.0, description="The denoising factor.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class KarrasScheduler(ComfyNode):
    """
    The Karras Scheduler node implements the Karras et al. noise schedule, which can provide
    improved sampling quality, especially for fewer sampling steps.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.KarrasScheduler

    steps: int = Field(default=20, description="The number of steps.")
    sigma_max: float = Field(default=14.614642, description="The maximum sigma value.")
    sigma_min: float = Field(default=0.0291675, description="The minimum sigma value.")
    rho: float = Field(default=7.0, description="The rho value.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class ExponentialScheduler(ComfyNode):
    """
    The Exponential Scheduler node provides an exponential decay schedule for the sampling process,
    which can offer a balance between speed and quality.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.ExponentialScheduler

    steps: int = Field(default=20, description="The number of steps.")
    sigma_max: float = Field(default=14.614642, description="The maximum sigma value.")
    sigma_min: float = Field(default=0.0291675, description="The minimum sigma value.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class PolyexponentialScheduler(ComfyNode):
    """
    The Polyexponential Scheduler node implements a more flexible scheduling mechanism,
    allowing for fine-tuned control over the noise schedule through the rho parameter.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.PolyexponentialScheduler

    steps: int = Field(
        default=20, description="The number of steps to compute the sigmas."
    )
    sigma_max: float = Field(default=14.614642, description="The maximum sigma value.")
    sigma_min: float = Field(default=0.0291675, description="The minimum sigma value.")
    rho: float = Field(default=1.0, description="The rho parameter for the scheduler.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class SDTurboScheduler(ComfyNode):
    """
    The SDTurbo Scheduler node is designed for very fast inference, often used with
    specific models trained for few-step generation. It's particularly useful for
    real-time or near-real-time applications.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SDTurboScheduler

    model: UNet = Field(
        default=UNet(), description="The model for which to use the scheduler."
    )
    steps: int = Field(default=1, description="The number of steps for the scheduler.")
    denoise: float = Field(
        default=1.0, description="The denoising factor to apply in the scheduler."
    )

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class VPScheduler(ComfyNode):
    """
    The VP (Variance Preserving) Scheduler node implements a variance preserving stochastic differential equation (SDE) based scheduler, which can provide high-quality results for certain types of models and generation tasks.
    sampling, custom, scheduler

    Use cases:
    - Generate custom sigma schedules for sampling
    - Fine-tune sampling parameters for specific models
    - Experiment with variance preserving noise schedules
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.VPScheduler

    steps: int = Field(
        default=20, description="The number of steps to compute the sigmas."
    )
    beta_d: float = Field(
        default=19.9, description="beta_d parameter for the VP scheduler."
    )
    beta_min: float = Field(
        default=0.1, description="beta_min parameter for the VP scheduler."
    )
    eps_s: float = Field(
        default=0.001, description="eps_s parameter for the VP scheduler."
    )

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class LTXVScheduler(ComfyNode):
    """
    Custom scheduler for LTXV models.
    sampling, custom, scheduler, ltxv

    Use cases:
    - Generate custom sigma schedules for sampling
    - Adjust sigmas based on latent tokens
    - Fine-tune sampling parameters for video models
    """

    _comfy_class = comfy_extras.nodes_lt.LTXVScheduler

    steps: int = Field(default=20, ge=1, le=10000, description="Number of steps.")
    max_shift: float = Field(
        default=2.05, ge=0.0, le=100.0, description="Maximum shift parameter."
    )
    base_shift: float = Field(
        default=0.95, ge=0.0, le=100.0, description="Base shift parameter."
    )
    stretch: bool = Field(
        default=True, description="Stretch sigmas to fit terminal value."
    )
    terminal: float = Field(
        default=0.1, ge=0.0, le=0.99, description="Terminal value for sigmas."
    )
    latent: Latent = Field(default=None, description="Optional latent input.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}

    @classmethod
    def get_title(cls):
        return "LTXV Scheduler"
