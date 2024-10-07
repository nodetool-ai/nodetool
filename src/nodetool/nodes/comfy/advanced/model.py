from pydantic import Field
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import UNet
from enum import Enum

from nodetool.workflows.processing_context import ProcessingContext


class SamplingEnum(str, Enum):
    EPS = "eps"
    V_PREDICTION = "v_prediction"
    LCM = "lcm"
    X0 = "x0"


class ModelSamplingBase(ComfyNode):
    @classmethod
    def return_type(cls):
        return {"model": UNet}

    def get_model_name(self):
        raise NotImplementedError("get_model_name not implemented")

    async def process(self, context: ProcessingContext) -> dict[str, UNet]:
        (unet,) = await self.call_comfy_node(context)

        return {"model": UNet(name=self.get_model_name(), model=unet)}


class ModelSamplingDiscrete(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    sampling: SamplingEnum = Field(
        default=SamplingEnum.EPS, description="The sampling method to use."
    )
    zsnr: bool = Field(default=False, description="Whether to use zero SNR.")

    @classmethod
    def get_title(cls):
        return "Model Sampling Discrete"

    def get_model_name(self):
        return self.model.name + "_sampling_discrete_" + self.sampling.value


class ModelSamplingStableCascade(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    shift: float = Field(
        default=2.0, description="The shift parameter.", ge=0.0, le=100.0
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling Stable Cascade"

    def get_model_name(self):
        return self.model.name + "_sampling_stable_cascade"


class ModelSamplingSD3(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    shift: float = Field(
        default=3.0, description="The shift parameter.", ge=0.0, le=100.0
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling SD3"

    def get_model_name(self):
        return self.model.name + "_sampling_sd3_" + str(self.shift)


class ModelSamplingAuraFlow(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    shift: float = Field(
        default=1.73, description="The shift parameter.", ge=0.0, le=100.0
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling Aura Flow"

    def get_model_name(self):
        return self.model.name + "_sampling_aura_flow_" + str(self.shift)


class ModelSamplingFlux(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    max_shift: float = Field(
        default=1.15, description="The maximum shift parameter.", ge=0.0, le=100.0
    )
    base_shift: float = Field(
        default=0.5, description="The base shift parameter.", ge=0.0, le=100.0
    )
    width: int = Field(
        default=1024, description="The width of the image.", ge=16, le=16384
    )
    height: int = Field(
        default=1024, description="The height of the image.", ge=16, le=16384
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling Flux"

    def get_model_name(self):
        return (
            self.model.name
            + "_sampling_flux_"
            + str(self.max_shift)
            + "_"
            + str(self.base_shift)
        )


class SamplingEnumEDM(str, Enum):
    V_PREDICTION = "v_prediction"
    EDM_PLAYGROUND_V25 = "edm_playground_v2.5"
    EPS = "eps"


class ModelSamplingContinuousEDM(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    sampling: SamplingEnumEDM = Field(
        default=SamplingEnumEDM.V_PREDICTION, description="The sampling method to use."
    )
    sigma_max: float = Field(
        default=120.0, description="The maximum sigma value.", ge=0.0, le=1000.0
    )
    sigma_min: float = Field(
        default=0.002, description="The minimum sigma value.", ge=0.0, le=1000.0
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling Continuous EDM"

    def get_model_name(self):
        return (
            self.model.name
            + "_sampling_continuous_edm_"
            + self.sampling.value
            + "_"
            + str(self.sigma_max)
            + "_"
            + str(self.sigma_min)
        )


class ModelSamplingContinuousV(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    sampling: SamplingEnumEDM = Field(
        default=SamplingEnumEDM.V_PREDICTION, description="The sampling method to use."
    )
    sigma_max: float = Field(
        default=500.0, description="The maximum sigma value.", ge=0.0, le=1000.0
    )
    sigma_min: float = Field(
        default=0.03, description="The minimum sigma value.", ge=0.0, le=1000.0
    )

    @classmethod
    def get_title(cls):
        return "Model Sampling Continuous V"

    def get_model_name(self):
        return (
            self.model.name
            + "_sampling_continuous_v_"
            + self.sampling.value
            + "_"
            + str(self.sigma_max)
            + "_"
            + str(self.sigma_min)
        )


class RescaleCFG(ModelSamplingBase):
    model: UNet = Field(default=UNet(), description="The model to patch.")
    multiplier: float = Field(
        default=0.7, description="The rescale multiplier.", ge=0.0, le=1.0
    )

    @classmethod
    def get_title(cls):
        return "Rescale CFG"

    def get_model_name(self):
        return self.model.name + "_rescale_cfg_" + str(self.multiplier)
