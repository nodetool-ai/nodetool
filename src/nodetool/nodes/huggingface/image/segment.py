import asyncio
from typing import Any
from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.common.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext


class Segformer(HuggingfaceNode):
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    async def process(self, context: ProcessingContext) -> dict[str, ImageRef]:
        image = await context.asset_to_io(self.image)
        result = await self.run_huggingface(
            model_id="nvidia/segformer-b3-finetuned-ade-512-512",
            context=context,
            data=image.read(),
        )

        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_base64(item["mask"])
            return item["label"], mask

        items = await asyncio.gather(*[convert_output(item) for item in list(result)])
        return {label: mask for label, mask in items}
