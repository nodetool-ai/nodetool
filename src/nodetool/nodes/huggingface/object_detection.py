from nodetool.metadata.types import (
    BoundingBox,
    HFObjectDetection,
    HFZeroShotObjectDetection,
    ImageRef,
    ObjectDetectionResult,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


class ObjectDetection(HuggingFacePipelineNode):
    """
    Detects and localizes objects in images.
    image, object detection, bounding boxes, huggingface

    Use cases:
    - Identify and count objects in images
    - Locate specific items in complex scenes
    - Assist in autonomous vehicle vision systems
    - Enhance security camera footage analysis

    Recommended models:
    - facebook/detr-resnet-50
    """

    model: HFObjectDetection = Field(
        default=HFObjectDetection(repo_id="facebook/detr-resnet-50"),
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Inputs",
        description="The input image for object detection",
    )
    threshold: float = Field(
        default=0.9,
        title="Confidence Threshold",
        description="Minimum confidence score for detected objects",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="The number of top predictions to return",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFObjectDetection]:
        return [
            HFObjectDetection(
                repo_id="facebook/detr-resnet-50",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="facebook/detr-resnet-101",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="hustvl/yolos-tiny",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="hustvl/yolos-small",
                allow_patterns=["README.md", "*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="microsoft/table-transformer-detection",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="microsoft/table-transformer-structure-recognition-v1.1-all",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="valentinafeve/yolos-fashionpedia",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "object-detection", self.get_model_id(), device=context.device
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, threshold=self.threshold)
        if isinstance(result, list):
            return [
                ObjectDetectionResult(
                    label=item["label"],
                    score=item["score"],
                    box=BoundingBox(
                        xmin=item["box"]["xmin"],
                        ymin=item["box"]["ymin"],
                        xmax=item["box"]["xmax"],
                        ymax=item["box"]["ymax"],
                    ),
                )
                for item in result
            ]
        else:
            raise ValueError(f"Invalid result type: {type(result)}")


class VisualizeObjectDetection(BaseNode):
    """
    Visualizes object detection results on images.
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to visualize",
    )

    objects: list[ObjectDetectionResult] = Field(
        default={},
        title="Detected Objects",
        description="The detected objects to visualize",
    )

    def required_inputs(self):
        return ["image", "objects"]

    @classmethod
    def get_title(cls) -> str:
        return "Visualize Object Detection"

    async def process(self, context: ProcessingContext) -> ImageRef:
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
        import io

        image = await context.image_to_pil(self.image)

        # Get the size of the input image
        width, height = image.size

        # Create figure with the same size as the input image
        fig, ax = plt.subplots(
            figsize=(width / 100, height / 100)
        )  # Convert pixels to inches
        ax.imshow(image)

        for obj in self.objects:
            xmin = obj.box.xmin
            ymin = obj.box.ymin
            xmax = obj.box.xmax
            ymax = obj.box.ymax

            rect = patches.Rectangle(
                (xmin, ymin),
                xmax - xmin,
                ymax - ymin,
                linewidth=1,
                edgecolor="r",
                facecolor="none",
            )
            ax.add_patch(rect)
            ax.text(
                xmin,
                ymin,
                f"{obj.label} ({obj.score:.2f})",
                color="r",
                fontsize=8,
                backgroundcolor="w",
            )

        ax.axis("off")

        # Remove padding around the image
        plt.tight_layout(pad=0)

        if fig is None:
            raise ValueError("Invalid plot")
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png", dpi=100, bbox_inches="tight", pad_inches=0)
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class ZeroShotObjectDetection(HuggingFacePipelineNode):
    """
    Detects objects in images without the need for training data.
    image, object detection, bounding boxes, zero-shot

    Use cases:
    - Quickly detect objects in images without training data
    - Identify objects in images without predefined labels
    - Automate object detection for large datasets

    Recommended models:
    - google/owlvit-base-patch32
    - google/owlvit-large-patch14
    - google/owlvit-base-patch16
    - google/owlv2-base-patch16
    - google/owlv2-base-patch16-ensemble
    - IDEA-Research/grounding-dino-tiny
    """

    model: HFZeroShotObjectDetection = Field(
        default=HFZeroShotObjectDetection(repo_id="google/owlv2-base-patch16"),
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Inputs",
        description="The input image for object detection",
    )
    threshold: float = Field(
        default=0.1,
        title="Confidence Threshold",
        description="Minimum confidence score for detected objects",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="The number of top predictions to return",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to detect in the image, separated by commas",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFZeroShotObjectDetection]:
        return [
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-base-patch32",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-large-patch14",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-base-patch16",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlv2-base-patch16",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlv2-base-patch16-ensemble",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="IDEA-Research/grounding-dino-tiny",
                allow_patterns=["README.md", "*.bin", "*.json", "**/*.json", "txt"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context,
            "zero-shot-object-detection",
            self.get_model_id(),
            device=context.device,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(
            image,
            candidate_labels=self.candidate_labels.split(","),
            threshold=self.threshold,
        )
        return [
            ObjectDetectionResult(
                label=item.label,  # type: ignore
                score=item.score,  # type: ignore
                box=BoundingBox(
                    xmin=item.box.xmin,  # type: ignore
                    ymin=item.box.ymin,  # type: ignore
                    xmax=item.box.xmax,  # type: ignore
                    ymax=item.box.ymax,  # type: ignore
                ),
            )
            for item in result  # type: ignore
        ]
