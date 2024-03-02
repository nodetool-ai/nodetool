from enum import Enum
from pydantic import Field
from genflow.metadata.types import ImageRef
from genflow.nodes.huggingface import HuggingfaceNode
from genflow.workflows.processing_context import ProcessingContext


class ModelId(str, Enum):
    GOOGLE_VIT_BASE_PATCH16_224 = "google/vit-base-patch16-224"
    MICROSOFT_RESNET_50 = "microsoft/resnet-50"
    MICROSOFT_RESNET_18 = "microsoft/resnet-18"
    APPLE_MOBILEVIT_SMALL = "apple/mobilevit-small"
    NATERAW_VIT_AGE_CLASSIFIER = "nateraw/vit-age-classifier"
    FALCONSAI_NSFW_IMAGE_DETECTION = "Falconsai/nsfw_image_detection"
    MICROSOFT_BEIT_BASE_PATCH16_224_PT22K_FT22K = (
        "microsoft/beit-base-patch16-224-pt22k-ft22k"
    )
    TIMM_VIT_LARGE_PATCH14_CLIP_224_OPENAI_FT_IN12K_IN1K = (
        "timm/vit_large_patch14_clip_224.openai_ft_in12k_in1k"
    )
    ORGANIKA_SDXL_DETECTOR = "Organika/sdxl-detector"
    RIZVANDWIKI_GENDER_CLASSIFICATION_2 = "rizvandwiki/gender-classification-2"


class Classifier(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.GOOGLE_VIT_BASE_PATCH16_224,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )

    async def process(self, context: ProcessingContext) -> list[dict[str, float]]:
        image = await context.to_io(self.image)
        result = await self.run_huggingface(
            model_id=self.model, context=context, data=image.read()
        )
        return result  # type: ignore
