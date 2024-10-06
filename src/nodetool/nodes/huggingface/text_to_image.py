from huggingface_hub import try_to_load_from_cache
from nodetool.metadata.types import HFImageToImage, HFLoraSD, HuggingFaceModel, ImageRef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.nodes.huggingface.stable_diffusion_base import (
    IPAdapter_SD15_Model,
    StableDiffusionBaseNode,
    StableDiffusionXLBase,
)
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress


import torch
from diffusers.pipelines.auto_pipeline import AutoPipelineForText2Image
from diffusers.pipelines.pipeline_utils import DiffusionPipeline
from diffusers.pipelines.pixart_alpha.pipeline_pixart_alpha import PixArtAlphaPipeline
from diffusers.pipelines.stable_diffusion.pipeline_stable_diffusion import (
    StableDiffusionPipeline,
)
from diffusers.pipelines.stable_diffusion_xl.pipeline_stable_diffusion_xl import (
    StableDiffusionXLPipeline,
)
from pydantic import Field

# class AuraFlow(BaseNode):
#     """
#     Generates images using the AuraFlow pipeline.
#     image, generation, AI, text-to-image

#     Use cases:
#     - Create unique images from text descriptions
#     - Generate illustrations for creative projects
#     - Produce visual content for digital media
#     """

#     prompt: str = Field(
#         default="A cat holding a sign that says hello world",
#         description="A text prompt describing the desired image.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     guidance_scale: float = Field(
#         default=7.0, description="The guidance scale for the transformation.", ge=1.0
#     )
#     num_inference_steps: int = Field(
#         default=25, description="The number of denoising steps.", ge=1, le=100
#     )
#     width: int = Field(
#         default=768, description="The width of the generated image.", ge=128, le=1024
#     )
#     height: int = Field(
#         default=768, description="The height of the generated image.", ge=128, le=1024
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _pipeline: AuraFlowPipeline | None = None

#     async def initialize(self, context: ProcessingContext):
#         self._pipeline = AuraFlowPipeline.from_pretrained(
#             "fal/AuraFlow", torch_dtype=torch.float16
#         )  # type: ignore

#     async def move_to_device(self, device: str):
#         pass

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._pipeline is None:
#             raise ValueError("Pipeline not initialized")

#         # Set up the generator for reproducibility if a seed is provided
#         generator = None
#         if self.seed != -1:
#             generator = torch.Generator(device=self._pipeline.device).manual_seed(
#                 self.seed
#             )

#         self._pipeline.enable_sequential_cpu_offload()

#         output = self._pipeline(
#             self.prompt,
#             negative_prompt=self.negative_prompt,
#             guidance_scale=self.guidance_scale,
#             num_inference_steps=self.num_inference_steps,
#             width=self.width,
#             height=self.height,
#             generator=generator,
#         )
#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)

# class Kandinsky2(BaseNode):
#     """
#     Generates images using the Kandinsky 2.2 model from text prompts.
#     image, generation, AI, text-to-image

#     Use cases:
#     - Create high-quality images from text descriptions
#     - Generate detailed illustrations for creative projects
#     - Produce visual content for digital media and art
#     - Explore AI-generated imagery for concept development
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="A text prompt describing the desired image.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     num_inference_steps: int = Field(
#         default=50, description="The number of denoising steps.", ge=1, le=100
#     )
#     width: int = Field(
#         default=768, description="The width of the generated image.", ge=128, le=1024
#     )
#     height: int = Field(
#         default=768, description="The height of the generated image.", ge=128, le=1024
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22Pipeline | None = None

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22Pipeline.from_pretrained(
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
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         output = self._pipeline(
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             height=self.height,
#             width=self.width,
#             num_inference_steps=self.num_inference_steps,
#             generator=generator,
#             callback=progress_callback(self.id, self.num_inference_steps, context),
#             callback_steps=1,
#         )

#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)


class PixArtAlpha(HuggingFacePipelineNode):
    """
    Generates images from text prompts using the PixArt-Alpha model.
    image, generation, AI, text-to-image

    Use cases:
    - Create unique images from detailed text descriptions
    - Generate concept art for creative projects
    - Produce visual content for digital media and marketing
    - Explore AI-generated imagery for artistic inspiration
    """

    prompt: str = Field(
        default="An astronaut riding a green horse",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="",
        description="A text prompt describing what to avoid in the image.",
    )
    num_inference_steps: int = Field(
        default=50,
        description="The number of denoising steps.",
        ge=1,
        le=100,
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=768,
        description="The width of the generated image.",
        ge=128,
        le=1024,
    )
    height: int = Field(
        default=768,
        description="The height of the generated image.",
        ge=128,
        le=1024,
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: PixArtAlphaPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HFImageToImage(
                repo_id="PixArt-alpha/PixArt-XL-2-1024-MS",
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="PixArt-alpha/PixArt-XL-2-1024-MS",
            model_class=PixArtAlphaPipeline,
            variant=None,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

        def callback(step: int, timestep: int, latents: torch.Tensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            generator=generator,
            callback=callback,
            callback_steps=1,
        )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class PixArtSigma(HuggingFacePipelineNode):
    """
    Generates images from text prompts using the PixArt-Sigma model.
    image, generation, AI, text-to-image

    Use cases:
    - Create unique images from detailed text descriptions
    - Generate concept art for creative projects
    - Produce visual content for digital media and marketing
    - Explore AI-generated imagery for artistic inspiration
    """

    prompt: str = Field(
        default="An astronaut riding a green horse",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="",
        description="A text prompt describing what to avoid in the image.",
    )
    num_inference_steps: int = Field(
        default=50,
        description="The number of denoising steps.",
        ge=1,
        le=100,
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=768,
        description="The width of the generated image.",
        ge=128,
        le=1024,
    )
    height: int = Field(
        default=768,
        description="The height of the generated image.",
        ge=128,
        le=1024,
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: PixArtAlphaPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HFImageToImage(
                repo_id="PixArt-alpha/PixArt-Sigma-XL-2-1024-MS",
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="PixArt-alpha/PixArt-Sigma-XL-2-1024-MS",
            model_class=PixArtAlphaPipeline,
            variant=None,
        )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            generator=generator,
            callback=callback,  # type: ignore
            callback_steps=1,
        )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class Kandinsky3(HuggingFacePipelineNode):
    """
    Generates images using the Kandinsky-3 model from text prompts.
    image, generation, AI, text-to-image

    Use cases:
    - Create detailed images from text descriptions
    - Generate unique illustrations for creative projects
    - Produce visual content for digital media and art
    - Explore AI-generated imagery for concept development
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    width: int = Field(
        default=1024, description="The width of the generated image.", ge=64, le=2048
    )
    height: int = Field(
        default=1024, description="The height of the generated image.", ge=64, le=2048
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForText2Image | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="kandinsky-community/kandinsky-3",
            ),
        ]

    @classmethod
    def get_title(cls) -> str:
        return "Kandinsky 3"

    def get_model_id(self):
        return "kandinsky-community/kandinsky-3"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="kandinsky-community/kandinsky-3",
            model_class=AutoPipelineForText2Image,
        )

    async def move_to_device(self, device: str):
        # Commented out as in the original class
        # if self._pipeline is not None:
        #     self._pipeline.to(device)
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class PlaygroundV2(HuggingFacePipelineNode):
    """
    Playground v2.5 is the state-of-the-art open-source model in aesthetic quality.
    image, generation, AI, text-to-image

    Use cases:
    - Create detailed images from text descriptions
    - Generate unique illustrations for creative projects
    - Produce visual content for digital media and art
    - Explore AI-generated imagery for concept development
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=1024, description="The width of the generated image.", ge=64, le=2048
    )
    height: int = Field(
        default=1024, description="The height of the generated image.", ge=64, le=2048
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    lora_model: HFLoraSD = Field(
        default=HFLoraSD(),
        description="The LORA model to use for image processing",
    )
    lora_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=3.0,
        description="Strength of the LORA image",
    )
    ip_adapter_model: IPAdapter_SD15_Model = Field(
        default=IPAdapter_SD15_Model.NONE,
        description="The IP adapter model to use for image processing",
    )
    ip_adapter_image: ImageRef = Field(
        default=ImageRef(),
        description="When provided the image will be fed into the IP adapter",
    )
    ip_adapter_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the IP adapter image",
    )
    _pipeline: DiffusionPipeline | None = None

    @classmethod
    def get_title(cls) -> str:
        return "Playground v2.5"

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="playgroundai/playground-v2.5-1024px-aesthetic",
                allow_patterns=[
                    "README.md",
                    "text_encoder/model.fp16.safetensors",
                    "text_encoder_2/model.fp16.safetensors",
                    "unet/diffusion_pytorch_model.fp16.safetensors",
                    "vae/diffusion_pytorch_model.fp16.safetensors",
                    "*.json",
                    "**/*.json",
                    "*.txt",
                    "**/*.txt",
                ],
            ),
        ]

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            cache_path = try_to_load_from_cache(
                "h94/IP-Adapter", f"models/{self.ip_adapter_model.value}"
            )
            if cache_path is None:
                raise ValueError(
                    f"Install the h94/IP-Adapter model to use it (Recommended Models above)"
                )
            assert self._pipeline is not None
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="models",
                weight_name=self.ip_adapter_model,
            )
            self._pipeline.set_ip_adapter_scale(self.ip_adapter_scale)

    async def _load_lora(self, context: ProcessingContext):
        if self.lora_model.repo_id != "" and self.lora_model.path:
            cache_path = try_to_load_from_cache(
                self.lora_model.repo_id,
                self.lora_model.path,
            )
            if cache_path is None:
                raise ValueError(
                    f"Install {self.lora_model.repo_id}/{self.lora_model.path} LORA to use it (Recommended Models above)"
                )
            assert self._pipeline is not None
            self._pipeline.load_lora_weights(
                cache_path,
                weight_name=self.lora_model.path,
                adapter_name="default",
            )

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="playgroundai/playground-v2.5-1024px-aesthetic",
            model_class=DiffusionPipeline,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        await self._load_lora(context)

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class StableDiffusion(StableDiffusionBaseNode):
    """
    Generates images from text prompts using Stable Diffusion.
    image, generation, AI, text-to-image

    Use cases:
    - Creating custom illustrations for various projects
    - Generating concept art for creative endeavors
    - Producing unique visual content for marketing materials
    - Exploring AI-generated art for personal or professional use
    """

    width: int = Field(
        default=512, ge=256, le=1024, description="Width of the generated image."
    )
    height: int = Field(
        default=512, ge=256, le=1024, description="Height of the generated image"
    )
    _pipeline: StableDiffusionPipeline | None = None

    @classmethod
    def get_title(cls):
        return "Stable Diffusion"

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
            config="Lykon/DreamShaper",
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        return await self.run_pipeline(context, width=self.width, height=self.height)


class StableDiffusionXL(StableDiffusionXLBase):
    """
    Generates images from text prompts using Stable Diffusion XL.
    image, generation, AI, text-to-image

    Use cases:
    - Creating custom illustrations for marketing materials
    - Generating concept art for game and film development
    - Producing unique stock imagery for websites and publications
    - Visualizing interior design concepts for clients
    """

    _pipeline: StableDiffusionXLPipeline | None = None

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        self._load_ip_adapter()

    async def process(self, context) -> ImageRef:
        return await self.run_pipeline(context)


# class FluxSchnell(HuggingFacePipelineNode):
#     """
#     Generates images using the FLUX.1-schnell model.
#     image, generation, AI, text-to-image, fast

#     Use cases:
#     - Rapid image generation from text descriptions
#     - Quick concept visualization for creative projects
#     - Fast prototyping of visual ideas
#     - Efficient batch image generation for various applications
#     """

#     prompt: str = Field(
#         default="A cat holding a sign that says hello world",
#         description="A text prompt describing the desired image.",
#     )
#     guidance_scale: float = Field(
#         default=0.0,
#         description="The scale for classifier-free guidance.",
#         ge=0.0,
#         le=20.0,
#     )
#     width: int = Field(
#         default=1360, description="The width of the generated image.", ge=64, le=2048
#     )
#     height: int = Field(
#         default=768, description="The height of the generated image.", ge=64, le=2048
#     )
#     num_inference_steps: int = Field(
#         default=4, description="The number of denoising steps.", ge=1, le=50
#     )
#     max_sequence_length: int = Field(
#         default=256, description="Maximum sequence length for the prompt.", ge=1, le=512
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )
#     enable_tiling: bool = Field(
#         default=False,
#         description="Enable tiling to save VRAM",
#     )

#     _pipeline: FluxPipeline | None = None

#     @classmethod
#     def get_recommended_models(cls) -> list[HuggingFaceModel]:
#         return [
#             HuggingFaceModel(
#                 repo_id="black-forest-labs/FLUX.1-schnell",
#                 allow_patterns=[
#                     "**/*.safetensors",
#                     "**/*.json",
#                     "**/*.txt",
#                     "*.json",
#                 ],
#             ),
#         ]

#     @classmethod
#     def get_title(cls) -> str:
#         return "FLUX.1-schnell"

#     def get_model_id(self):
#         return "black-forest-labs/FLUX.1-schnell"

#     async def initialize(self, context: ProcessingContext):
#         self._pipeline = await self.load_model(
#             context=context,
#             model_id=self.get_model_id(),
#             model_class=FluxPipeline,
#             torch_dtype=torch.bfloat16,
#             variant=None,
#             device="cpu",
#         )

#     async def move_to_device(self, device: str):
#         if self._pipeline is not None:
#             self._pipeline.to(device)
#             # throws VRAM error on 24GB
#             if self.enable_tiling:
#                 self._pipeline.enable_sequential_cpu_offload()
#                 self._pipeline.vae.enable_slicing()
#                 self._pipeline.vae.enable_tiling()

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._pipeline is None:
#             raise ValueError("Pipeline not initialized")

#         # Set up the generator for reproducibility
#         generator = None
#         if self.seed != -1:
#             generator = torch.Generator(device="cpu").manual_seed(self.seed)

#         def callback(step: int, timestep: int, latents: torch.Tensor) -> None:
#             context.post_message(
#                 NodeProgress(
#                     node_id=self.id,
#                     progress=step,
#                     total=self.num_inference_steps,
#                 )
#             )

#         # Generate the image
#         output = self._pipeline(
#             prompt=self.prompt,
#             guidance_scale=self.guidance_scale,
#             height=self.height,
#             width=self.width,
#             num_inference_steps=self.num_inference_steps,
#             max_sequence_length=self.max_sequence_length,
#             generator=generator,
#             callback=callback,
#             callback_steps=1,
#         )

#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)
