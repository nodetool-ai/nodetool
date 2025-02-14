from pydantic import Field
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.metadata.types import Latent, UNet
from enum import Enum

from nodetool.workflows.processing_context import ProcessingContext
import comfy.model_sampling
import comfy_extras.nodes_model_advanced
import comfy_extras.nodes_lt


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
    """
    Patches a model for discrete sampling.
    advanced, model, sampling, discrete

    Use cases:
    - Apply different sampling methods to a model
    - Enable zero SNR sampling
    """

    _comfy_class = comfy.model_sampling.ModelSamplingDiscrete

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
    """
    Patches a model for stable cascade sampling.
    advanced, model, sampling, stable, cascade

    Use cases:
    - Apply stable cascade sampling to a model
    - Adjust shift parameters for stable cascade sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingStableCascade

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
    """
    Patches a model for SD3 sampling.
    advanced, model, sampling, sd3

    Use cases:
    - Apply SD3 sampling to a model
    - Adjust shift parameters for SD3 sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingSD3

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
    """
    Patches a model for Aura Flow sampling.
    advanced, model, sampling, aura, flow

    Use cases:
    - Apply Aura Flow sampling to a model
    - Adjust shift parameters for Aura Flow sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingAuraFlow

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
    """
    Patches a model for Flux sampling.
    advanced, model, sampling, flux

    Use cases:
    - Apply Flux sampling to a model
    - Adjust shift parameters for Flux sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingFlux

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
    """
    Patches a model for continuous EDM sampling.
    advanced, model, sampling, edm, continuous

    Use cases:
    - Apply continuous EDM sampling to a model
    - Adjust sigma parameters for continuous EDM sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingContinuousEDM

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
    """
    Patches a model for continuous V sampling.
    advanced, model, sampling, v, continuous

    Use cases:
    - Apply continuous V sampling to a model
    - Adjust sigma parameters for continuous V sampling
    """

    _comfy_class = comfy_extras.nodes_model_advanced.ModelSamplingContinuousV

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
    """
    Patches a model for rescale CFG.
    advanced, model, rescale, cfg

    Use cases:
    - Adjust the CFG multiplier for a model
    - Apply rescale CFG to a model
    """

    _comfy_class = comfy_extras.nodes_model_advanced.RescaleCFG

    model: UNet = Field(default=UNet(), description="The model to patch.")
    multiplier: float = Field(
        default=0.7, description="The rescale multiplier.", ge=0.0, le=1.0
    )

    @classmethod
    def get_title(cls):
        return "Rescale CFG"

    def get_model_name(self):
        return self.model.name + "_rescale_cfg_" + str(self.multiplier)


class ModelSamplingLTXV(ComfyNode):
    """
    Patches a model for LTXV sampling.
    advanced, model, sampling, ltxv

    Use cases:
    - Modify a model for LTXV sampling
    - Adjust shift parameters based on latent tokens
    - Enable advanced sampling techniques
    """

    _comfy_class = comfy_extras.nodes_lt.ModelSamplingLTXV

    model: UNet = Field(description="The model to patch.")
    max_shift: float = Field(
        default=2.05, ge=0.0, le=100.0, description="Maximum shift parameter."
    )
    base_shift: float = Field(
        default=0.95, ge=0.0, le=100.0, description="Base shift parameter."
    )
    latent: Latent = Field(default=None, description="Optional latent input.")

    @classmethod
    def return_type(cls):
        return {"model": UNet}
