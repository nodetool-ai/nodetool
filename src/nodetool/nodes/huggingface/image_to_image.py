from enum import Enum
import numpy as np
import torch
from RealESRGAN import RealESRGAN
from huggingface_hub import try_to_load_from_cache
from nodetool.metadata.types import (
    HFControlNet,
    HFImageToImage,
    HFRealESRGAN,
    HFStableDiffusionUpscale,
    HuggingFaceModel,
    ImageRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.nodes.huggingface.stable_diffusion_base import (
    StableDiffusionBaseNode,
    StableDiffusionScheduler,
    StableDiffusionXLBase,
    get_scheduler_class,
)
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.processing_context import ProcessingContext
from diffusers.pipelines.auto_pipeline import AutoPipelineForImage2Image
from diffusers.models.controlnet import ControlNetModel
from diffusers.pipelines.controlnet.pipeline_controlnet_img2img import (
    StableDiffusionControlNetImg2ImgPipeline,
)
from diffusers.pipelines.controlnet.pipeline_controlnet_inpaint import (
    StableDiffusionControlNetInpaintPipeline,
)
from diffusers.pipelines.controlnet.pipeline_controlnet import (
    StableDiffusionControlNetPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_img2img import (
    StableDiffusionImg2ImgPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_inpaint import (
    StableDiffusionInpaintPipeline,
)
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion_upscale import (
    StableDiffusionUpscalePipeline,
)
from diffusers.pipelines.controlnet.pipeline_controlnet_sd_xl import (
    StableDiffusionXLControlNetPipeline,
)
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl_img2img import (
    StableDiffusionXLImg2ImgPipeline,
)
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl_inpaint import (
    StableDiffusionXLInpaintPipeline,
)
from pydantic import Field


HF_CONTROLNET_MODELS: list[HFControlNet] = [
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_canny",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_inpaint",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_mlsd",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_tile",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_shuffle",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_ip2p",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_lineart",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_lineart_anime",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_scribble",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_openpose",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_scribble",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_seg",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_hed",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
    HFControlNet(
        repo_id="lllyasviel/control_v11p_sd15_normalbae",
        path="diffusion_pytorch_model.fp16.safetensors",
    ),
]


class BaseImageToImage(HuggingFacePipelineNode):
    """
    Base class for image-to-image transformation tasks.
    image, transformation, generation, huggingface
    """

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not BaseImageToImage

    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    prompt: str = Field(
        default="",
        title="Prompt",
        description="The text prompt to guide the image transformation (if applicable)",
    )

    def required_inputs(self):
        return ["image"]

    def get_model_id(self):
        raise NotImplementedError("Subclass must implement abstract method")

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-to-image", self.get_model_id(), device=context.device
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, prompt=self.prompt)  # type: ignore
        return await context.image_from_pil(result)  # type: ignore


class RealESRGANNode(BaseNode):
    """
    Performs image super-resolution using the RealESRGAN model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    """
    Performs image super-resolution using the RealESRGAN model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    class RealESRGANScale(str, Enum):
        x2 = "x2"
        x4 = "x4"
        x8 = "x8"

    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    scale: RealESRGANScale = Field(
        default=RealESRGANScale.x2,
        title="Scale",
        description="The scale factor for the image super-resolution",
    )
    _model: RealESRGAN | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFRealESRGAN]:
        return [
            HFRealESRGAN(
                repo_id="ai-forever/Real-ESRGAN",
                path="RealESRGAN_x2.pth",
            ),
            HFRealESRGAN(
                repo_id="ai-forever/Real-ESRGAN",
                path="RealESRGAN_x4.pth",
            ),
            HFRealESRGAN(
                repo_id="ai-forever/Real-ESRGAN",
                path="RealESRGAN_x8.pth",
            ),
        ]

    def required_inputs(self):
        return ["image"]

    async def initialize(self, context: ProcessingContext):
        model_id = "ai-forever/Real-ESRGAN"

        if self.scale == self.RealESRGANScale.x2:
            model_path = "RealESRGAN_x2.pth"
        elif self.scale == self.RealESRGANScale.x4:
            model_path = "RealESRGAN_x4.pth"
        elif self.scale == self.RealESRGANScale.x8:
            model_path = "RealESRGAN_x8.pth"
        else:
            raise ValueError("Invalid scale factor")

        if self.scale == self.RealESRGANScale.x2:
            scale = 2
        elif self.scale == self.RealESRGANScale.x4:
            scale = 4
        elif self.scale == self.RealESRGANScale.x8:
            scale = 8
        else:
            raise ValueError("Invalid scale factor")

        model_path = try_to_load_from_cache(model_id, model_path)

        if model_path is None:
            raise ValueError("Download the model first from RECOMMENDED_MODELS above")

        self._model = RealESRGAN("cpu", scale=scale)
        self._model.load_weights(model_path)

    async def move_to_device(self, device: str):
        if self._model is not None:
            self._model.device = device
            self._model.model.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        assert self._model is not None, "Model not initialized"
        image = await context.image_to_pil(self.image)
        sr_image = self._model.predict(image)
        return await context.image_from_pil(sr_image)


class Swin2SR(BaseImageToImage):
    """
    Performs image super-resolution using the Swin2SR model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    model: HFImageToImage = Field(
        default=HFImageToImage(),
        title="Model ID on Huggingface",
        description="The model ID to use for image super-resolution",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HFImageToImage(
                repo_id="caidas/swin2SR-classical-sr-x2-64",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-classical-sr-x4-48",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-lightweight-sr-x2-64",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
        ]

    @classmethod
    def get_title(cls) -> str:
        return "Swin2SR"

    def get_model_id(self):
        return self.model.repo_id


class Kandinsky3Img2Img(HuggingFacePipelineNode):
    """
    Transforms existing images using the Kandinsky-3 model based on text prompts.
    image, generation, AI, image-to-image

    Use cases:
    - Modify existing images based on text descriptions
    - Apply specific styles or concepts to photographs or artwork
    - Create variations of existing visual content
    - Blend AI-generated elements with existing images
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image transformation.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    strength: float = Field(
        default=0.5,
        description="The strength of the transformation. Use a value between 0.0 and 1.0.",
        ge=0.0,
        le=1.0,
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForImage2Image | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="kandinsky-community/kandinsky-3",
            ),
        ]

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Kandinsky 3 Image-to-Image"

    def get_model_id(self) -> str:
        return "kandinsky-community/kandinsky-3"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="kandinsky-community/kandinsky-3",
            model_class=AutoPipelineForImage2Image,
        )

    async def move_to_device(self, device: str):
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        input_image = await context.image_to_pil(self.image)
        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            image=input_image,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class StableDiffusionControlNetNode(StableDiffusionBaseNode):
    """
    Generates images using Stable Diffusion with ControlNet guidance.
    image, generation, AI, text-to-image, controlnet

    Use cases:
    - Generate images with precise control over composition and structure
    - Create variations of existing images while maintaining specific features
    - Artistic image generation with guided outputs
    """

    controlnet: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to use for guidance.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the generation process.",
    )
    controlnet_conditioning_scale: float = Field(
        default=1.0,
        description="The scale for ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    _pipeline: StableDiffusionControlNetPipeline | None = None

    @classmethod
    def get_recommended_models(cls):
        return HF_CONTROLNET_MODELS + super().get_recommended_models()

    def required_inputs(self):
        return ["control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet"

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.controlnet.to(device)
            self._pipeline.model.to(device)

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        controlnet = await self.load_model(
            context=context,
            model_class=ControlNetModel,
            model_id=self.controlnet.repo_id,
            torch_dtype=torch.float16,
            variant="fp16",
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionControlNetPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            controlnet=controlnet,
            config="Lykon/DreamShaper",  # workaround for missing SD15 repo
        )
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image = await context.image_to_pil(self.control_image)
        return await self.run_pipeline(
            context,
            image=control_image,
            width=control_image.width,
            height=control_image.height,
            controlnet_conditioning_scale=float(self.controlnet_conditioning_scale),
        )


class StableDiffusionImg2ImgNode(StableDiffusionBaseNode):
    """
    Transforms existing images based on text prompts using Stable Diffusion.
    image, generation, AI, image-to-image

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering photographs
    - Creating variations of existing artwork
    - Applying text-guided edits to images
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionImg2ImgPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            safety_checker=None,
            config="Lykon/DreamShaper",
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        init_image = await context.image_to_pil(self.init_image)
        return await self.run_pipeline(
            context,
            image=init_image,
            width=init_image.width,
            height=init_image.height,
            strength=self.strength,
        )


class StableDiffusionControlNetInpaintNode(StableDiffusionBaseNode):
    """
    Performs inpainting on images using Stable Diffusion with ControlNet guidance.
    image, inpainting, AI, controlnet

    Use cases:
    - Remove unwanted objects from images with precise control
    - Fill in missing parts of images guided by control images
    - Modify specific areas of images while preserving the rest and maintaining structure
    """

    class StableDiffusionControlNetModel(str, Enum):
        INPAINT = "lllyasviel/control_v11p_sd15_inpaint"

    controlnet: StableDiffusionControlNetModel = Field(
        default=StableDiffusionControlNetModel.INPAINT,
        description="The ControlNet model to use for guidance.",
    )
    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating areas to be inpainted.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the inpainting process.",
    )
    controlnet_conditioning_scale: float = Field(
        default=0.5,
        description="The scale for ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    _pipeline: StableDiffusionControlNetInpaintPipeline | None = None

    def required_inputs(self):
        return ["init_image", "mask_image", "control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet Inpaint"

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        controlnet = await self.load_pipeline(
            context,
            "controlnet",
            self.controlnet.value,
            device=context.device,
        )
        self._pipeline = await self.load_pipeline(
            context,
            "stable-diffusion-controlnet-inpaint",
            self.model.repo_id,
            controlnet=controlnet,
            device=context.device,
        )  # type: ignore
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        control_image = await context.image_to_pil(self.control_image)
        return await self.run_pipeline(
            context,
            image=init_image,
            mask_image=mask_image,
            control_image=control_image,
            width=init_image.width,
            height=init_image.height,
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
        )


class StableDiffusionInpaintNode(StableDiffusionBaseNode):
    """
    Performs inpainting on images using Stable Diffusion.
    image, inpainting, AI

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating areas to be inpainted.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for inpainting. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionInpaintPipeline | None = None

    def required_inputs(self):
        return ["init_image", "mask_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion (Inpaint)"

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        if self._pipeline is None:
            self._pipeline = await self.load_model(
                context=context,
                model_class=StableDiffusionInpaintPipeline,
                model_id=self.model.repo_id,
                path=self.model.path,
                safety_checker=None,
                config="Lykon/DreamShaper",
            )
            assert self._pipeline is not None
            self._load_ip_adapter()
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        return await self.run_pipeline(
            context,
            image=init_image,
            mask_image=mask_image,
            width=init_image.width,
            height=init_image.height,
            strength=self.strength,
        )


class StableDiffusionControlNetImg2ImgNode(StableDiffusionBaseNode):
    """
    Transforms existing images using Stable Diffusion with ControlNet guidance.
    image, generation, AI, image-to-image, controlnet

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to be transformed.",
    )
    strength: float = Field(
        default=0.5,
        description="Similarity to the input image",
        ge=0.0,
        le=1.0,
    )
    controlnet: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to use for guidance.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the transformation.",
    )

    _pipeline: StableDiffusionControlNetImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["image", "control_image"]

    @classmethod
    def get_recommended_models(cls):
        return HF_CONTROLNET_MODELS + super().get_recommended_models()

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        if not context.is_huggingface_model_cached(self.controlnet.repo_id):
            raise ValueError(
                f"ControlNet model {self.controlnet.repo_id} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")

        controlnet = await self.load_model(
            context=context,
            model_class=ControlNetModel,
            model_id=self.controlnet.repo_id,
            torch_dtype=torch.float16,
            variant="fp16",
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionControlNetImg2ImgPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            controlnet=controlnet,
            config="Lykon/DreamShaper",  # workaround for missing SD15 repo
        )
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        input_image = await context.image_to_pil(self.image)
        control_image = await context.image_to_pil(self.control_image)

        return await self.run_pipeline(
            context,
            image=input_image,
            control_image=control_image,
            width=input_image.width,
            height=input_image.height,
            strength=self.strength,
        )


class StableDiffusionUpscale(HuggingFacePipelineNode):
    """
    Upscales an image using Stable Diffusion 4x upscaler.
    image, upscaling, AI, stable-diffusion

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Create high-resolution versions of small images
    """

    prompt: str = Field(
        default="",
        description="The prompt for image generation.",
    )
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    num_inference_steps: int = Field(
        default=25,
        ge=1,
        le=100,
        description="Number of upscaling steps.",
    )
    guidance_scale: float = Field(
        default=7.5,
        ge=1.0,
        le=20.0,
        description="Guidance scale for generation.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.HeunDiscreteScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=2**32 - 1,
        description="Seed for the random number generator. Use -1 for a random seed.",
    )
    enable_tiling: bool = Field(
        default=False,
        description="Enable tiling to save VRAM",
    )

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion 4x Upscale"

    _pipeline: StableDiffusionUpscalePipeline | None = None

    @classmethod
    def get_recommended_models(cls):
        return [
            HFStableDiffusionUpscale(
                repo_id="stabilityai/stable-diffusion-x4-upscaler",
                allow_patterns=[
                    "README.md",
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            )
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionUpscalePipeline,
            model_id="stabilityai/stable-diffusion-x4-upscaler",
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        if self._pipeline is not None:
            scheduler_class = get_scheduler_class(scheduler_type)
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config
            )
            if self.enable_tiling:
                self._pipeline.vae.enable_tiling()

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        input_image = await context.image_to_pil(self.image)

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        upscaled_image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            image=input_image,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            callback=progress_callback(self.id, self.num_inference_steps, context),  # type: ignore
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(upscaled_image)


class StableDiffusionXLImg2Img(StableDiffusionXLBase):
    """
    Transforms existing images based on text prompts using Stable Diffusion XL.
    image, generation, AI, image-to-image

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering photographs
    - Creating variations of existing artwork
    - Applying text-guided edits to images
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionXLImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLImg2ImgPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            safety_checker=None,
        )
        assert self._pipeline is not None
        self._pipeline.enable_model_cpu_offload()
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context) -> ImageRef:
        init_image = await context.image_to_pil(self.init_image)
        init_image = init_image.resize((self.width, self.height))
        return await self.run_pipeline(
            context, image=init_image, strength=self.strength
        )


class StableDiffusionXLInpainting(StableDiffusionXLBase):
    """
    Performs inpainting on images using Stable Diffusion XL.
    image, inpainting, AI

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating areas to be inpainted.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for inpainting. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionXLInpaintPipeline | None = None

    def required_inputs(self):
        return ["image", "mask_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL (Inpaint)"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            self._pipeline = await self.load_model(
                context=context,
                model_class=StableDiffusionXLInpaintPipeline,
                model_id=self.model.repo_id,
                path=self.model.path,
                safety_checker=None,
            )
            assert self._pipeline is not None
            self._load_ip_adapter()
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        input_image = await context.image_to_pil(self.image)
        mask_image = await context.image_to_pil(self.mask_image)
        mask_image = mask_image.resize((self.width, self.height))
        return await self.run_pipeline(
            context,
            image=input_image,
            mask_image=mask_image,
            strength=self.strength,
            width=input_image.width,
            height=input_image.height,
        )


class StableDiffusionXLControlNetNode(StableDiffusionXLImg2Img):
    """
    Transforms existing images using Stable Diffusion XL with ControlNet guidance.
    image, generation, AI, image-to-image, controlnet

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations
    """

    controlnet: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to use for guidance.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the transformation.",
    )
    controlnet_conditioning_scale: float = Field(
        default=1.0,
        description="The scale for ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    _pipeline: StableDiffusionXLControlNetPipeline | None = None

    def required_inputs(self):
        return ["control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL ControlNet"

    async def initialize(self, context: ProcessingContext):
        controlnet = await self.load_model(
            context=context,
            model_class=ControlNetModel,
            model_id=self.controlnet.repo_id,
            path=self.controlnet.path,
            variant=None,
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLControlNetPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            controlnet=controlnet,
        )
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image = await context.image_to_pil(self.control_image)
        init_image = None
        if not self.init_image.is_empty():
            init_image = await context.image_to_pil(self.init_image)
            init_image = init_image.resize((self.width, self.height))

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        return await self.run_pipeline(
            context,
            init_image=init_image,
            image=control_image,
            strength=self.strength,
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        )

        return await context.image_from_pil(output.images[0])  # type: ignore


# class Kandinsky2Img2Img(BaseNode):
#     """
#     Transforms existing images based on text prompts using the Kandinsky 2.2 model.
#     image, generation, AI, image-to-image

#     Use cases:
#     - Transform existing images based on text prompts
#     - Apply specific styles or concepts to existing images
#     - Modify photographs or artworks with AI-generated elements
#     - Create variations of existing visual content
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2 Image-to-Image"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="A text prompt describing the desired image transformation.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     num_inference_steps: int = Field(
#         default=50, description="The number of denoising steps.", ge=1, le=100
#     )
#     strength: float = Field(
#         default=0.5,
#         description="The strength of the transformation. Use a value between 0.0 and 1.0.",
#         ge=0.0,
#         le=1.0,
#     )
#     image: ImageRef = Field(
#         default=ImageRef(),
#         title="Input Image",
#         description="The input image to transform",
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22Img2ImgPipeline | None = None

#     def required_inputs(self):
#         return ["image"]

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22Img2ImgPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-decoder", torch_dtype=torch.float16
#         )  # type: ignore

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._prior_pipeline is None or self._pipeline is None:
#             raise ValueError("Pipelines not initialized")

#         # Set up the generator for reproducibility
#         generator = torch.Generator(device="cpu")
#         if self.seed != -1:
#             generator = generator.manual_seed(self.seed)

#         # Enable sequential CPU offload for memory efficiency
#         self._prior_pipeline.enable_sequential_cpu_offload()
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         input_image = await context.image_to_pil(self.image)
#         output = self._pipeline(
#             image=input_image,
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             num_inference_steps=self.num_inference_steps,
#             generator=generator,
#             callback=progress_callback(self.id, self.num_inference_steps, context),
#             callback_steps=1,
#         )

#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)


# def make_hint(image: PIL.Image.Image) -> torch.Tensor:
#     np_array = np.array(image)
#     detected_map = torch.from_numpy(np_array).float() / 255.0
#     hint = detected_map.permute(2, 0, 1)
#     return hint[:3, :, :].unsqueeze(0)


# class Kandinsky2ControlNet(BaseNode):
#     """
#     Transforms existing images based on text prompts and control images using the Kandinsky 2.2 model with ControlNet.
#     image, generation, AI, image-to-image, controlnet

#     Use cases:
#     - Transform existing images based on text prompts with precise control
#     - Apply specific styles or concepts to existing images guided by control images
#     - Modify photographs or artworks with AI-generated elements while maintaining specific structures
#     - Create variations of existing visual content with controlled transformations
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2 with ControlNet"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="The prompt to guide the image generation.",
#     )
#     negative_prompt: str = Field(
#         default="", description="The prompt not to guide the image generation."
#     )
#     hint: ImageRef = Field(
#         default=ImageRef(),
#         title="Control Image",
#         description="The controlnet condition image.",
#     )
#     height: int = Field(
#         default=512,
#         description="The height in pixels of the generated image.",
#         ge=64,
#         le=2048,
#     )
#     width: int = Field(
#         default=512,
#         description="The width in pixels of the generated image.",
#         ge=64,
#         le=2048,
#     )
#     num_inference_steps: int = Field(
#         default=30, description="The number of denoising steps.", ge=1, le=100
#     )
#     guidance_scale: float = Field(
#         default=4.0,
#         description="Guidance scale as defined in Classifier-Free Diffusion Guidance.",
#         ge=1.0,
#         le=20.0,
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )
#     output_type: str = Field(
#         default="pil",
#         description="The output format of the generated image.",
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22ControlnetPipeline | None = None

#     def required_inputs(self):
#         return ["hint"]

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22ControlnetPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-controlnet-depth",
#             torch_dtype=torch.float16,
#         )  # type: ignore

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._prior_pipeline is None or self._pipeline is None:
#             raise ValueError("Pipelines not initialized")

#         # Set up the generator for reproducibility
#         generator = torch.Generator(device="cpu")
#         if self.seed != -1:
#             generator = generator.manual_seed(self.seed)

#         # Enable sequential CPU offload for memory efficiency
#         self._prior_pipeline.enable_sequential_cpu_offload()
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         # Prepare the control image (hint)
#         hint = await context.image_to_pil(self.hint)
#         hint = hint.resize((self.width, self.height))

#         output = self._pipeline(
#             hint=make_hint(hint),
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             height=self.height,
#             width=self.width,
#             num_inference_steps=self.num_inference_steps,
#             guidance_scale=self.guidance_scale,
#             generator=generator,
#             output_type="pil",
#             callback=progress_callback(self.id, self.num_inference_steps, context),  # type: ignore
#             callback_steps=1,
#         )

#         return await context.image_from_pil(output.images[0])  # type: ignore
