from nodetool.metadata.types import (
    HFImageClassification,
    HFZeroShotImageClassification,
    ImageRef,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field
from transformers import ImageClassificationPipeline


class ImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    """

    model: HFImageClassification = Field(
        default=HFImageClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )
    _pipeline: ImageClassificationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageClassification]:
        return [
            HFImageClassification(
                repo_id="google/vit-base-patch16-224",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="microsoft/resnet-50",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="microsoft/resnet-18",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="apple/mobilevit-small",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="apple/mobilevit-xx-small",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="nateraw/vit-age-classifier",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="Falconsai/nsfw_image_detection",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="rizvandwiki/gender-classification-2",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    def get_model_id(self):
        return self.model.repo_id

    @classmethod
    def get_title(cls) -> str:
        return "Image Classifier"

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-classification", self.get_model_id(), device=context.device
        )

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)  # type: ignore
        return {str(item["label"]): float(item["score"]) for item in result}  # type: ignore


class ZeroShotImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets

    Recommended models:
    - openai/clip-vit-large-patch14
    - openai/clip-vit-base-patch16
    - openai/clip-vit-base-patch32
    - patrickjohncyh/fashion-clip
    - laion/CLIP-ViT-H-14-laion2B-s32B-b79K
    """

    model: HFZeroShotImageClassification = Field(
        default=HFZeroShotImageClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the image against, separated by commas",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFZeroShotImageClassification]:
        return [
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch16",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch32",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch14",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="patricjohncyh/fashion-clip",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="laion/CLIP-ViT-H-14-laion2B-s32B-b79K",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="laion/CLIP-ViT-g-14-laion2B-s12B-b42K",
                allow_patterns=["README.md", "pytorch_model.bin", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Image Classifier"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="zero-shot-image-classification",
            model_id=self.get_model_id(),
            device=context.device,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(
            image, candidate_labels=self.candidate_labels.split(",")
        )  # type: ignore
        return {str(item["label"]): float(item["score"]) for item in result}  # type: ignore
