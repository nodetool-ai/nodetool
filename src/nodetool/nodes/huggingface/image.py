from enum import Enum
from nodetool.metadata.types import ColumnType, DataframeRef, ImageRef, ColumnDef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from typing import Any
import asyncio


class Classifier(HuggingFacePipelineNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    - Visual quality control in manufacturing to identify defective products
    - Medical image analysis to assist in diagnosing conditions
    """

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

    model: ModelId = Field(
        default=ModelId.GOOGLE_VIT_BASE_PATCH16_224,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )

    @property
    def pipeline_task(self) -> str:
        return 'image-classification'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class ZeroShotClassifier(HuggingFacePipelineNode):
    """
    Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets
    """

    class ModelId(str, Enum):
        OPENAI_CLIP_VIT_LARGE_PATCH14 = "openai/clip-vit-large-patch14"
        GOOGLE_SIGLIP_SO400M_PATCH14_384 = "google/siglip-so400m-patch14-384"
        OPENAI_CLIP_VIT_BASE_PATCH16 = "openai/clip-vit-base-patch16"
        OPENAI_CLIP_VIT_BASE_PATCH32 = "openai/clip-vit-base-patch32"
        PATRICKJOHNCYH_FASHION_CLIP = "patrickjohncyh/fashion-clip"
        LAION_CLIP_VIT_H_14_LAION2B_S32B_B79K = "laion/CLIP-ViT-H-14-laion2B-s32B-b79K"

    model: ModelId = Field(
        default=ModelId.OPENAI_CLIP_VIT_LARGE_PATCH14,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the image against, separated by commas",
    )

    @property
    def pipeline_task(self) -> str:
        return 'zero-shot-image-classification'
    
    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)



# This has too much overlap with other SD nodes
# class StableDiffusionXL(HuggingfaceNode):
#     """
#     Generates images from text prompts using advanced diffusion models.
#     image, text, generation, synthesis, text-to-image

#     Use cases:
#     - Creating custom illustrations for marketing materials
#     - Generating concept art for game and film development
#     - Producing unique stock imagery for websites and publications
#     - Visualizing interior design concepts for clients
#     """

#     class Scheduler(str, Enum):
#         DPMSolverSDEScheduler = "DPMSolverSDEScheduler"
#         EulerDiscreteScheduler = "EulerDiscreteScheduler"
#         LMSDiscreteScheduler = "LMSDiscreteScheduler"
#         DDIMScheduler = "DDIMScheduler"
#         DDPMScheduler = "DDPMScheduler"
#         HeunDiscreteScheduler = "HeunDiscreteScheduler"
#         DPMSolverMultistepScheduler = "DPMSolverMultistepScheduler"
#         DEISMultistepScheduler = "DEISMultistepScheduler"
#         PNDMScheduler = "PNDMScheduler"
#         EulerAncestralDiscreteScheduler = "EulerAncestralDiscreteScheduler"
#         UniPCMultistepScheduler = "UniPCMultistepScheduler"
#         KDPM2DiscreteScheduler = "KDPM2DiscreteScheduler"
#         DPMSolverSinglestepScheduler = "DPMSolverSinglestepScheduler"
#         KDPM2AncestralDiscreteScheduler = "KDPM2AncestralDiscreteScheduler"

#     class ModelId(str, Enum):
#         STABLE_DIFFUSION_XL_BASE_1_0 = "stabilityai/stable-diffusion-xl-base-1.0"
#         CAGLIOSTRO_ANIMAGINE_XL_3_0 = "cagliostrolab/animagine-xl-3.0"
#         NERIJS_PIXEL_ART_XL = "nerijs/pixel-art-xl"
#         STABLE_DIFFUSION_XL_V8 = "stablediffusionapi/juggernaut-xl-v8"

#     model: ModelId = Field(
#         default=ModelId.STABLE_DIFFUSION_XL_BASE_1_0,
#         title="Model ID on Huggingface",
#         description="The model ID to use for the image generation",
#     )
#     inputs: str = Field(
#         default="A photo of a cat.",
#         title="Inputs",
#         description="The input text to the model",
#     )

#     negative_prompt: str = Field(default="", description="The negative prompt to use.")
#     seed: int = Field(default=0, ge=0, le=1000000)
#     guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
#     num_inference_steps: int = Field(default=30, ge=1, le=100)
#     width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
#     height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
#     scheduler: Scheduler = Scheduler.EulerDiscreteScheduler

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         result = await self.run_huggingface(
#             model_id=self.model.value, context=context, params={"inputs": self.inputs}
#         )
#         img = await context.image_from_bytes(result)  # type: ignore
#         return img


class Segformer(HuggingFacePipelineNode):
    """
    Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images
    """

    class ModelId(str, Enum):
        NVIDIA_SEGFORMER_B3_FINETUNED_ADE_512_512 = "nvidia/segformer-b3-finetuned-ade-512-512"

    model: ModelId = Field(
        default=ModelId.NVIDIA_SEGFORMER_B3_FINETUNED_ADE_512_512,
        title="Model ID on Huggingface",
        description="The model ID to use for the segmentation",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    @property
    def pipeline_task(self) -> str:
        return 'image-segmentation'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.image)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, ImageRef]:
        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_base64(item["mask"])
            return item["label"], mask

        items = await asyncio.gather(*[convert_output(item) for item in list(result)])
        return {label: mask for label, mask in items}

    async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, ImageRef]:
        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_pil(item["mask"])
            return item["label"], mask

        items = await asyncio.gather(*[convert_output(item) for item in result])
        return {label: mask for label, mask in items}
    


class ObjectDetection(HuggingFacePipelineNode):
    """
    Detects and localizes objects in images.
    image, object detection, bounding boxes, huggingface

    Use cases:
    - Identify and count objects in images
    - Locate specific items in complex scenes
    - Assist in autonomous vehicle vision systems
    - Enhance security camera footage analysis
    """

    class ModelId(str, Enum):
        FACEBOOK_DETR_RESNET_50 = "facebook/detr-resnet-50"

    model: ModelId = Field(
        default=ModelId.FACEBOOK_DETR_RESNET_50,
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Inputs",
        description="The input image for object detection",
    )
    threshold: float = Field(
        default=0.9,
        title="Confidence Threshold",
        description="Minimum confidence score for detected objects",
    )

    @property
    def pipeline_task(self) -> str:
        return 'object-detection'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "threshold": self.threshold,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> DataframeRef:
        return await self.process_local_result(context, result)

    async def process_local_result(self, context: ProcessingContext, result: Any) -> DataframeRef:
        data = [
            [item["label"],
            item["score"],
            item["box"]["xmin"],
            item["box"]["ymin"],
            item["box"]["xmax"],
            item["box"]["ymax"],
            ]
            for item in result
        ]
        columns = [
            ColumnDef(name="label", data_type="string"),
            ColumnDef(name="score", data_type="float"),
            ColumnDef(name="xmin",  data_type="float"),
            ColumnDef(name="ymin",  data_type="float"),
            ColumnDef(name="xmax",  data_type="float"),
            ColumnDef(name="ymax",  data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)

    async def process(self, context: ProcessingContext) -> list[dict]:
        return await super().process(context)
    


class DepthEstimation(HuggingFacePipelineNode):
    """
    Estimates depth from a single image.
    image, depth estimation, 3D, huggingface

    Use cases:
    - Generate depth maps for 3D modeling
    - Assist in augmented reality applications
    - Enhance computer vision systems for robotics
    - Improve scene understanding in autonomous vehicles
    """

    class ModelId(str, Enum):
        DEPTH_ANYTHING = "LiheYoung/depth-anything-base-hf"
        DEPTH_ANYTHING_V2_SMALL = "depth-anything/Depth-Anything-V2-Small"
        INTEL_DPT_LARGE = "Intel/dpt-large"

    model: ModelId = Field(
        default=ModelId.DEPTH_ANYTHING,
        title="Model ID on Huggingface",
        description="The model ID to use for depth estimation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image for depth estimation",
    )

    @property
    def pipeline_task(self) -> str:
        return 'depth-estimation'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> ImageRef:
        depth_map = await context.image_from_base64(result['depth'])
        return depth_map

    async def process_local_result(self, context: ProcessingContext, result: Any) -> ImageRef:
        depth_ref = await context.image_from_pil(result['depth'])
        return depth_ref

    async def process(self, context: ProcessingContext) -> ImageRef:
        return await super().process(context)
    

class ImageToImage(HuggingFacePipelineNode):
    """
    Performs image-to-image transformation tasks.
    image, transformation, generation, huggingface

    Use cases:
    - Style transfer
    - Image inpainting
    - Image super-resolution
    - Image colorization
    """

    class ModelId(str, Enum):
        SWIN2SR = "caidas/swin2SR-classical-sr-x2-64"
        REAL_ESRGAN_X4PLUS = "qualcomm/Real-ESRGAN-x4plus"
        INSTRUCT_PIX2PIX = "timbrooks/instruct-pix2pix"

    model: ModelId = Field(
        default=ModelId.SWIN2SR,
        title="Model ID on Huggingface",
        description="The model ID to use for the image-to-image transformation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    prompt: str = Field(
        default="",
        title="Prompt",
        description="The text prompt to guide the image transformation (if applicable)",
    )

    @property
    def pipeline_task(self) -> str:
        return 'image-to-image'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "prompt": self.prompt,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> ImageRef:
        return await context.image_from_base64(result)

    async def process_local_result(self, context: ProcessingContext, result: Any) -> ImageRef:
        return await context.image_from_pil(result)

    async def process(self, context: ProcessingContext) -> ImageRef:
        return await super().process(context)