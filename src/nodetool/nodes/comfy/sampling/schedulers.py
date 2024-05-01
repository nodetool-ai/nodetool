from pydantic import Field
from nodetool.metadata.types import Sigmas, UNet
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.comfy.sampling import SchedulerEnum


class BasicScheduler(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model to use.")
    scheduler: SchedulerEnum = Field(
        default=SchedulerEnum.NORMAL, description="The scheduler name."
    )
    steps: int = Field(default=20, description="The number of steps.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class KarrasScheduler(ComfyNode):
    steps: int = Field(default=20, description="The number of steps.")
    sigma_max: float = Field(default=14.614642, description="The maximum sigma value.")
    sigma_min: float = Field(default=0.0291675, description="The minimum sigma value.")
    rho: float = Field(default=7.0, description="The rho value.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class ExponentialScheduler(ComfyNode):
    steps: int = Field(default=20, description="The number of steps.")
    sigma_max: float = Field(default=14.614642, description="The maximum sigma value.")
    sigma_min: float = Field(default=0.0291675, description="The minimum sigma value.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class PolyexponentialScheduler(ComfyNode):
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
