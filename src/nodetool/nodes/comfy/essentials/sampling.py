from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import ImageRef, Latent, UNet, CLIP, Conditioning
from pydantic import Field
from enum import Enum
from typing import List, Optional


class KSamplerVariationsStochastic(ComfyNode):
    """
    Generate variations of an image using stochastic sampling.
    sampling, variations, stochastic

    Use cases:
    - Create diverse variations of an image
    - Explore different sampling outcomes
    - Generate multiple versions with subtle differences
    """

    _comfy_class = "KSamplerVariationsStochastic+"
    model: UNet = Field(default=UNet(), description="The model to use for sampling")
    latent_image: Latent = Field(default=Latent(), description="The input latent image")
    noise_seed: int = Field(default=0, description="Seed for noise generation")
    steps: int = Field(default=25, description="Number of sampling steps")
    cfg: float = Field(default=7.0, description="Classifier-free guidance scale")
    sampler: str = Field(default="euler", description="Sampler to use")
    scheduler: str = Field(default="normal", description="Scheduler to use")
    positive: Conditioning = Field(
        default=Conditioning(), description="Positive conditioning"
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="Negative conditioning"
    )
    variation_seed: int = Field(default=0, description="Seed for variations")
    variation_strength: float = Field(default=0.2, description="Strength of variations")
    cfg_scale: float = Field(
        default=1.0, description="Scale for classifier-free guidance"
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class KSamplerVariationsWithNoise(ComfyNode):
    """
    Generate variations by injecting noise during sampling.
    sampling, variations, noise

    Use cases:
    - Add controlled randomness to sampling process
    - Create variations with noise injection
    - Fine-tune the balance between original and varied outputs
    """

    _comfy_class = "KSamplerVariationsWithNoise+"
    model: UNet = Field(default=UNet(), description="The model to use for sampling")
    latent_image: Latent = Field(default=Latent(), description="The input latent image")
    main_seed: int = Field(default=0, description="Main seed for sampling")
    steps: int = Field(default=20, description="Number of sampling steps")
    cfg: float = Field(default=8.0, description="Classifier-free guidance scale")
    sampler_name: str = Field(default="euler", description="Name of sampler to use")
    scheduler: str = Field(default="normal", description="Name of scheduler to use")
    positive: Conditioning = Field(
        default=Conditioning(), description="Positive conditioning"
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="Negative conditioning"
    )
    variation_strength: float = Field(
        default=0.17, description="Strength of variations"
    )
    variation_seed: int = Field(default=12345, description="Seed for variations")
    denoise: float = Field(default=1.0, description="Denoising strength")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class InjectLatentNoise(ComfyNode):
    """
    Inject noise into a latent image.
    latent, noise, injection

    Use cases:
    - Add controlled randomness to latent representations
    - Create variations of latent images
    - Augment latent space for more diverse outputs
    """

    _comfy_class = "InjectLatentNoise+"
    latent: Latent = Field(default=Latent(), description="The input latent image")
    noise_seed: int = Field(default=0, description="Seed for noise generation")
    noise_strength: float = Field(default=1.0, description="Strength of injected noise")
    normalize: bool = Field(default=False, description="Whether to normalize the noise")
    mask: Optional[ImageRef] = Field(
        default=None, description="Optional mask for noise injection"
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class FluxSamplerParams(ComfyNode):
    """
    Set up parameters for Flux sampler.
    sampling, flux, parameters

    Use cases:
    - Configure advanced sampling parameters
    - Experiment with different sampling settings
    - Fine-tune the sampling process for specific outputs
    """

    _comfy_class = "FluxSamplerParams+"
    model: UNet = Field(default=UNet(), description="The model to use")
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to use"
    )
    latent_image: Latent = Field(default=Latent(), description="The input latent image")
    seed: str = Field(default="?", description="Sampling seed")
    sampler: str = Field(default="euler", description="Sampler name")
    scheduler: str = Field(default="simple", description="Scheduler name")
    steps: str = Field(default="20", description="Number of steps")
    guidance: str = Field(default="3.5", description="Guidance scale")
    max_shift: str = Field(default="", description="Max shift")
    base_shift: str = Field(default="", description="Base shift")
    denoise: str = Field(default="1.0", description="Denoising strength")

    @classmethod
    def return_type(cls):
        return {"latent": Latent, "params": dict}


class PlotParameters(ComfyNode):
    """
    Plot sampler parameters alongside generated images.
    visualization, parameters, plot

    Use cases:
    - Visualize relationships between parameters and outputs
    - Compare results across different sampling configurations
    - Create visual summaries of sampling experiments
    """

    _comfy_class = "PlotParameters+"
    images: ImageRef = Field(default=ImageRef(), description="The generated images")
    params: dict = Field(default={}, description="The sampling parameters")
    order_by: str = Field(default="none", description="Parameter to order by")
    cols_value: str = Field(default="none", description="Parameter for column grouping")
    cols_num: int = Field(default=-1, description="Number of columns (-1 for auto)")
    add_prompt: str = Field(default="false", description="Whether to add prompt text")
    add_params: str = Field(default="true", description="Whether to add parameter text")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class TextEncodeForSamplerParams(ComfyNode):
    """
    Encode text for use with sampler parameters.
    text, encoding, sampling

    Use cases:
    - Prepare text inputs for advanced sampling techniques
    - Encode multiple prompts for batch processing
    - Create structured text inputs for sampling workflows
    """

    _comfy_class = "TextEncodeForSamplerParams+"
    text: str = Field(default="", description="The input text to encode")
    clip: CLIP = Field(default=CLIP(), description="The CLIP model to use for encoding")

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class SamplerSelectHelper(ComfyNode):
    """
    Helper node for selecting samplers.
    sampling, selection, helper

    Use cases:
    - Simplify sampler selection in workflows
    - Create preset sampler configurations
    - Batch process with multiple samplers
    """

    _comfy_class = "SamplerSelectHelper+"
    samplers: List[bool] = Field(
        default_factory=list, description="List of boolean flags for samplers"
    )

    @classmethod
    def return_type(cls):
        return {"string": str}


class SchedulerSelectHelper(ComfyNode):
    """
    Helper node for selecting schedulers.
    scheduling, selection, helper

    Use cases:
    - Simplify scheduler selection in workflows
    - Create preset scheduler configurations
    - Batch process with multiple schedulers
    """

    _comfy_class = "SchedulerSelectHelper+"
    schedulers: List[bool] = Field(
        default_factory=list, description="List of boolean flags for schedulers"
    )

    @classmethod
    def return_type(cls):
        return {"string": str}
