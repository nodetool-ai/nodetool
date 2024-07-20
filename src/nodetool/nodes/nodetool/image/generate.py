from msilib.schema import Environment
import os

from nodetool.api.stable_diffusion import SDRequest
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


class StableDiffusion(BaseNode):
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)

    async def process(self, context: ProcessingContext) -> ImageRef:
        req = SDRequest(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            steps=self.num_inference_steps,
            cfg=self.guidance_scale,
            seed=self.seed,
            width=self.width,
            height=self.height,
        )
        sd_url = Environment.get_sd_url()

        res = await context.http_post(sd_url, req.model_dump())
        img_str = res["image"]
        return await context.image_from_base64(img_str)
