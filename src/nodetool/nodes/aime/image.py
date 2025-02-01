from pydantic import Field
from nodetool.common.environment import Environment
from nodetool.metadata.types import ImageRef, Provider
from nodetool.providers.aime.prediction import fetch_auth_key
from nodetool.providers.aime.types import JobEvent, Progress
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress


class StableDiffusion3(BaseNode):
    """
    Generate images using Stable Diffusion 3 through the Aime API.
    image generation, ai art, stable diffusion

    Use cases:
    - Generate high-quality images from text descriptions
    - Create artistic variations of prompts
    - Produce realistic or stylized imagery
    """

    prompt: str = Field(
        default="",
        description="The text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="out of frame, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers",
        description="Text prompt describing elements to avoid in the image.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="An image to use as a starting point for generation.",
    )
    height: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Height of the generated image.",
    )
    width: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Width of the generated image.",
    )
    seed: int = Field(
        default=-1,
        description="Random seed for generation. Use -1 for random seed.",
    )
    num_samples: int = Field(
        default=1,
        ge=1,
        le=4,
        description="Number of images to generate.",
    )
    steps: int = Field(
        default=30,
        ge=1,
        le=100,
        description="Number of denoising steps.",
    )
    cfg_scale: float = Field(
        default=5.0,
        ge=1.0,
        le=20.0,
        description="Classifier free guidance scale.",
    )
    denoise: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        description="Denoising strength.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return [
            "prompt",
            "height",
            "width",
            "seed",
        ]

    async def process(self, context: ProcessingContext) -> ImageRef:
        def progress_callback(progress: Progress):
            context.post_message(
                NodeProgress(
                    node_id=self._id,
                    progress=progress.progress,
                    total=100,
                )
            )

        payload = {
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "height": self.height,
            "width": self.width,
            "seed": self.seed,
            "num_samples": self.num_samples,
            "steps": self.steps,
            "cfg_scale": self.cfg_scale,
            "denoise": self.denoise,
        }

        if self.image.is_set():
            b64 = await context.image_to_base64(self.image)
            payload["image"] = "data:image/png;base64," + b64

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model="stable_diffusion_3",
            params={
                "data": payload,
                "progress_callback": progress_callback,
            },
        )

        images = response.get("images", None)
        if not images or len(images) == 0:
            raise ValueError("No image found in the response")

        # remove data-uri prefix
        base64 = images[0].split(",")[1]
        return await context.image_from_base64(base64)


class Flux(BaseNode):
    """
    Generate images using Flux through the Aime API.
    image generation, ai art, flux

    Use cases:
    - Generate high-quality images from text descriptions
    - Create artistic variations of prompts
    - Produce realistic or stylized imagery
    """

    prompt: str = Field(
        default="",
        description="The text prompt describing the desired image.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="An image to use as a starting point for generation.",
    )
    height: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Height of the generated image.",
    )
    width: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Width of the generated image.",
    )
    seed: int = Field(
        default=-1,
        description="Random seed for generation. Use -1 for random seed.",
    )
    steps: int = Field(
        default=50,
        ge=1,
        le=100,
        description="Number of denoising steps.",
    )
    guidance: float = Field(
        default=3.5,
        ge=1.0,
        le=20.0,
        description="Guidance scale for generation.",
    )
    image2image_strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength of image-to-image transformation.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return [
            "prompt",
            "image",
            "height",
            "width",
        ]

    async def process(self, context: ProcessingContext) -> ImageRef:
        def progress_callback(progress: Progress):
            context.post_message(
                NodeProgress(
                    node_id=self._id,
                    progress=progress.progress,
                    total=100,
                )
            )

        payload = {
            "prompt": self.prompt,
            "height": self.height,
            "width": self.width,
            "seed": self.seed,
            "steps": self.steps,
            "guidance": self.guidance,
            "image2image_strength": self.image2image_strength,
            "provide_progress_images": "none",
            "wait_for_result": False,
        }

        if self.image.is_set():
            b64 = await context.image_to_base64(self.image)
            payload["image"] = "data:image/png;base64," + b64

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model="flux-dev",
            params={
                "data": payload,
                "progress_callback": progress_callback,
            },
        )

        images = response.get("images", None)
        if not images or len(images) == 0:
            raise ValueError("No image found in the response")

        # remove data-uri prefix
        base64 = images[0].split(",")[1]
        return await context.image_from_base64(base64)
