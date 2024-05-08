from enum import Enum

from pydantic import Field
from nodetool.common.environment import Environment
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class Model(str, Enum):
    RESNET_18 = "microsoft/resnet-18"


class Classify(BaseNode):
    model: Model = Field(
        default=Model.RESNET_18, description="The classification model to use"
    )
    image: ImageRef = Field(default=ImageRef(), description="The image to classify")

    async def process(self, context: ProcessingContext) -> str:
        from transformers import AutoImageProcessor, AutoModelForImageClassification
        import torch

        device = Environment.get_torch_device()

        image = await context.image_to_pil(self.image)

        image_processor = AutoImageProcessor.from_pretrained(self.model.value)
        model = AutoModelForImageClassification.from_pretrained(self.model.value).to(
            device
        )

        inputs = image_processor(image, return_tensors="pt").to(device)

        with torch.no_grad():
            logits = model(**inputs).logits

        # model predicts one of the 1000 ImageNet classes
        predicted_label = logits.argmax(-1).item()
        return model.config.id2label[predicted_label]
