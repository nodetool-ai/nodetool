import asyncio
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field
from nodetool.metadata.types import BaseType, ImageRef
from nodetool.common.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext


class SegmentationResult(BaseType):
    type: Literal["segmentation_result"] = "segmentation_result"
    score: float = Field(
        title="Score",
        description="The confidence score of the segmentation",
    )
    label: str = Field(
        title="Label",
        description="The label of the segmented object",
    )
    mask: ImageRef = Field(
        title="Mask",
        description="The mask of the segmented object",
    )


class Segformer(HuggingfaceNode):
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    async def process(self, context: ProcessingContext) -> list[SegmentationResult]:
        image = await context.to_io(self.image)
        result = await self.run_huggingface(
            model_id="nvidia/segformer-b3-finetuned-ade-512-512",
            context=context,
            data=image.read(),
        )

        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_base64(item["mask"])
            return SegmentationResult(
                score=item["score"], label=item["label"], mask=mask
            )

        return await asyncio.gather(*[convert_output(item) for item in list(result)])
