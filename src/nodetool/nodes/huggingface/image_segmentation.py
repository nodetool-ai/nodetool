import PIL.ImageDraw
import PIL.ImageFont
import PIL.Image
import numpy as np
from nodetool.metadata.types import (
    HFImageSegmentation,
    ImageRef,
    ImageSegmentationResult,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field
from transformers import ImageSegmentationPipeline


import asyncio
from typing import Any


class Segmentation(HuggingFacePipelineNode):
    """
    Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images

    Recommended models:
    - nvidia/segformer-b3-finetuned-ade-512-512
    - mattmdjaga/segformer_b2_clothes
    """

    model: HFImageSegmentation = Field(
        default=HFImageSegmentation(
            repo_id="nvidia/segformer-b3-finetuned-ade-512-512"
        ),
        title="Model ID on Huggingface",
        description="The model ID to use for the segmentation",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    _pipeline: ImageSegmentationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageSegmentation]:
        return [
            HFImageSegmentation(
                repo_id="nvidia/segformer-b3-finetuned-ade-512-512",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFImageSegmentation(
                repo_id="mattmdjaga/segformer_b2_clothes",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    def get_model_id(self):
        return self.model.repo_id

    @classmethod
    def get_title(cls) -> str:
        return "Image Segmentation"

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-segmentation", self.get_model_id(), device=context.device
        )

    async def process(
        self, context: ProcessingContext
    ) -> list[ImageSegmentationResult]:
        assert self._pipeline is not None

        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)

        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_pil(item["mask"])
            return ImageSegmentationResult(mask=mask, label=item["label"])

        return await asyncio.gather(*[convert_output(item) for item in result])


class FindSegment(BaseNode):
    """
    Extracts a specific segment from a list of segmentation masks.
    """

    segments: list[ImageSegmentationResult] = Field(
        default={},
        title="Segmentation Masks",
        description="The segmentation masks to search",
    )

    segment_label: str = Field(
        default="",
        title="Label",
        description="The label of the segment to extract",
    )

    def required_inputs(self):
        return ["segments"]

    @classmethod
    def get_title(cls) -> str:
        return "Find Segment"

    async def process(self, context: ProcessingContext) -> ImageRef:
        for segment in self.segments:
            if segment.label == self.segment_label:
                return segment.mask
        raise ValueError(f"Segment not found: {self.segment_label}")


class VisualizeSegmentation(BaseNode):
    """
    Visualizes segmentation masks on images with labels.
    image, segmentation, visualization

    Use cases:
    - Visualize results of image segmentation models
    - Analyze and compare different segmentation techniques
    - Create labeled images for presentations or reports
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to visualize",
    )

    segments: list[ImageSegmentationResult] = Field(
        default=[],
        title="Segmentation Masks",
        description="The segmentation masks to visualize",
    )

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Visualize Segmentation"

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        image = image.convert("RGB")
        draw = PIL.ImageDraw.Draw(image)

        # Create a color map
        color_map = self.generate_color_map(len(self.segments))

        for i, segment in enumerate(self.segments):
            segment_mask = await context.image_to_pil(segment.mask)
            segment_mask = segment_mask.convert("L")
            color = color_map[i % len(color_map)]

            # Create a colored mask
            colored_mask = PIL.Image.new("RGBA", image.size, (0, 0, 0, 0))
            colored_mask_draw = PIL.ImageDraw.Draw(colored_mask)
            colored_mask_draw.bitmap((0, 0), segment_mask, fill=(*color, 128))

            # Blend the colored mask with the original image
            image = PIL.Image.alpha_composite(
                image.convert("RGBA"), colored_mask
            ).convert("RGB")

            # Find the centroid of the mask to place the label
            mask_array = np.array(segment_mask)
            y_indices, x_indices = np.where(mask_array > 0)
            if len(x_indices) > 0 and len(y_indices) > 0:
                centroid_x = int(np.mean(x_indices))
                centroid_y = int(np.mean(y_indices))

                # Draw the label
                draw = PIL.ImageDraw.Draw(image)
                font = PIL.ImageFont.load_default(16)
                label = segment.label
                text_bbox = draw.textbbox((centroid_x, centroid_y), label, font=font)
                draw.rectangle(text_bbox, fill="white")
                draw.text((centroid_x, centroid_y), label, fill=tuple(color), font=font)

        return await context.image_from_pil(image)

    def generate_color_map(self, num_colors):
        """Generate a list of distinct colors."""
        colors = []
        for i in range(num_colors):
            r = int((i * 67) % 256)
            g = int((i * 111) % 256)
            b = int((i * 193) % 256)
            colors.append((r, g, b))
        return colors
