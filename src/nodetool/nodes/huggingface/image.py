from enum import Enum
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import ColumnType, DataframeRef, ImageRef, ColumnDef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from typing import Any
import asyncio
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import ImageRef
from nodetool.workflows.types import NodeProgress
import torch
from diffusers import AuraFlowPipeline  # type: ignore
from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image  # type: ignore
from diffusers import (
    KandinskyV22Pipeline,  # type: ignore
    KandinskyV22PriorPipeline,  # type: ignore
    KandinskyV22Img2ImgPipeline,  # type: ignore
)
from diffusers import StableCascadeDecoderPipeline, StableCascadePriorPipeline  # type: ignore
from diffusers import StableDiffusion3ControlNetPipeline  # type: ignore
from diffusers.models import SD3ControlNetModel  # type: ignore


class ImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    - Visual quality control in manufacturing to identify defective products
    - Medical image analysis to assist in diagnosing conditions
    """

    class ImageClassifierModelId(str, Enum):
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

    model: ImageClassifierModelId = Field(
        default=ImageClassifierModelId.GOOGLE_VIT_BASE_PATCH16_224,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "image-classification"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class ZeroShotImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets
    """

    class ZeroShotImageClassifierModelId(str, Enum):
        OPENAI_CLIP_VIT_LARGE_PATCH14 = "openai/clip-vit-large-patch14"
        GOOGLE_SIGLIP_SO400M_PATCH14_384 = "google/siglip-so400m-patch14-384"
        OPENAI_CLIP_VIT_BASE_PATCH16 = "openai/clip-vit-base-patch16"
        OPENAI_CLIP_VIT_BASE_PATCH32 = "openai/clip-vit-base-patch32"
        PATRICKJOHNCYH_FASHION_CLIP = "patrickjohncyh/fashion-clip"
        LAION_CLIP_VIT_H_14_LAION2B_S32B_B79K = "laion/CLIP-ViT-H-14-laion2B-s32B-b79K"

    model: ZeroShotImageClassifierModelId = Field(
        default=ZeroShotImageClassifierModelId.OPENAI_CLIP_VIT_LARGE_PATCH14,
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-image-classification"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

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


class Segmentation(HuggingFacePipelineNode):
    """
    Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images
    """

    class SegmentationModelId(str, Enum):
        NVIDIA_SEGFORMER_B3_FINETUNED_ADE_512_512 = (
            "nvidia/segformer-b3-finetuned-ade-512-512"
        )

    model: SegmentationModelId = Field(
        default=SegmentationModelId.NVIDIA_SEGFORMER_B3_FINETUNED_ADE_512_512,
        title="Model ID on Huggingface",
        description="The model ID to use for the segmentation",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "image-segmentation"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.image)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, ImageRef]:
        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_base64(item["mask"])
            return item["label"], mask

        items = await asyncio.gather(*[convert_output(item) for item in list(result)])
        return {label: mask for label, mask in items}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, ImageRef]:
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

    class ObjectDetectionModelId(str, Enum):
        FACEBOOK_DETR_RESNET_50 = "facebook/detr-resnet-50"

    model: ObjectDetectionModelId = Field(
        default=ObjectDetectionModelId.FACEBOOK_DETR_RESNET_50,
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
    top_k: int = Field(
        default=5,
        title="Top K",
        description="The number of top predictions to return",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "object-detection"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "threshold": self.threshold,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        data = [
            [
                item["label"],
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
            ColumnDef(name="xmin", data_type="float"),
            ColumnDef(name="ymin", data_type="float"),
            ColumnDef(name="xmax", data_type="float"),
            ColumnDef(name="ymax", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)

    async def process(self, context: ProcessingContext) -> list[dict]:
        return await super().process(context)


class ZeroShotObjectDetection(HuggingFacePipelineNode):
    """
    Detects objects in images without the need for training data.
    image, object detection, bounding boxes, zero-shot

    Use cases:
    - Quickly detect objects in images without training data
    - Identify objects in images without predefined labels
    - Automate object detection for large datasets
    """

    class ZeroShotObjectDetectionModelId(str, Enum):
        GOOGLE_OWL_VIT_BASE_PATCH32 = "google/owlvit-base-patch32"
        GOOGLE_OWL_VIT_LARGE_PATCH14 = "google/owlvit-large-patch14"
        GOOGLE_OWL_VIT_BASE_PATCH16 = "google/owlvit-base-patch16"
        GOOGLE_OWL_V2_BASE_PATCH16 = "google/owlv2-base-patch16"
        GOOGLE_OWL_VIT_BASE_PATCH16_ENSEMBLE = "google/owlv2-base-patch16-ensemble"
        IDEA_RESEARCH_GROUNDING_DINO_TINY = "IDEA-Research/grounding-dino-tiny"

    model: ZeroShotObjectDetectionModelId = Field(
        default=ZeroShotObjectDetectionModelId.GOOGLE_OWL_V2_BASE_PATCH16,
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )

    inputs: ImageRef = Field(
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-object-detection"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
            "threshold": self.threshold,
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        data = [
            [
                item["label"],
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
            ColumnDef(name="xmin", data_type="float"),
            ColumnDef(name="ymin", data_type="float"),
            ColumnDef(name="xmax", data_type="float"),
            ColumnDef(name="ymax", data_type="float"),
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

    class DepthEstimationModelId(str, Enum):
        DEPTH_ANYTHING = "LiheYoung/depth-anything-base-hf"
        DEPTH_ANYTHING_V2_SMALL = "depth-anything/Depth-Anything-V2-Small"
        INTEL_DPT_LARGE = "Intel/dpt-large"

    model: DepthEstimationModelId = Field(
        default=DepthEstimationModelId.DEPTH_ANYTHING,
        title="Model ID on Huggingface",
        description="The model ID to use for depth estimation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image for depth estimation",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "depth-estimation"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        depth_map = await context.image_from_base64(result["depth"])
        return depth_map

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        depth_ref = await context.image_from_pil(result["depth"])
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

    class ImageToImageModelId(str, Enum):
        SWIN2SR = "caidas/swin2SR-classical-sr-x2-64"
        REAL_ESRGAN_X4PLUS = "qualcomm/Real-ESRGAN-x4plus"
        INSTRUCT_PIX2PIX = "timbrooks/instruct-pix2pix"

    model: ImageToImageModelId = Field(
        default=ImageToImageModelId.SWIN2SR,
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "image-to-image"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "prompt": self.prompt,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        return await context.image_from_base64(result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        return await context.image_from_pil(result)

    async def process(self, context: ProcessingContext) -> ImageRef:
        return await super().process(context)


class AuraFlowNode(BaseNode):
    """
    Generates images using the AuraFlow pipeline.
    image, generation, AI, text-to-image

    Use cases:
    - Create unique images from text descriptions
    - Generate illustrations for creative projects
    - Produce visual content for digital media
    """

    prompt: str = Field(
        default="A cat holding a sign that says hello world",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AuraFlowPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        self._pipeline = AuraFlowPipeline.from_pretrained(
            "fal/AuraFlow", torch_dtype=torch.float16
        )  # type: ignore

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility if a seed is provided
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device=self._pipeline.device).manual_seed(
                self.seed
            )

        output = self._pipeline(
            self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
        )
        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class Kandinsky2Node(BaseNode):
    """
    Generates images using the Kandinsky 2.2 model. Provide image for img2img mode.
    image, generation, AI, text-to-image, image-to-image

    Use cases:
    - Create high-quality images from text descriptions
    - Transform existing images based on text prompts
    - Generate detailed illustrations for creative projects
    - Produce visual content for digital media and art
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="", description="A text prompt describing what to avoid in the image."
    )
    num_inference_steps: int = Field(
        default=50, description="The number of denoising steps.", ge=1, le=100
    )
    width: int = Field(
        default=768, description="The width of the generated image.", ge=128, le=1024
    )
    height: int = Field(
        default=768, description="The height of the generated image.", ge=128, le=1024
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform (optional)",
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _prior_pipeline: KandinskyV22PriorPipeline | None = None
    _pipeline: KandinskyV22Pipeline | KandinskyV22Img2ImgPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
            "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
        )  # type: ignore
        if self.image.is_empty():
            self._pipeline = KandinskyV22Pipeline.from_pretrained(
                "kandinsky-community/kandinsky-2-2-decoder", torch_dtype=torch.float16
            )  # type: ignore
        else:
            self._pipeline = KandinskyV22Img2ImgPipeline.from_pretrained(
                "kandinsky-community/kandinsky-2-2-decoder", torch_dtype=torch.float16
            )  # type: ignore

    async def move_to_device(self, device: str):
        # Commented out as in the example
        # if self._prior_pipeline is not None and self._pipeline is not None:
        #     self._prior_pipeline.to(device)
        #     self._pipeline.to(device)
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._prior_pipeline is None or self._pipeline is None:
            raise ValueError("Pipelines not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        # Enable sequential CPU offload for memory efficiency
        self._prior_pipeline.enable_sequential_cpu_offload()
        self._pipeline.enable_sequential_cpu_offload()

        # Generate image embeddings
        prior_output = self._prior_pipeline(
            self.prompt, negative_prompt=self.negative_prompt, generator=generator
        )
        image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

        if self.image.is_empty():
            output = self._pipeline(
                image_embeds=image_emb,
                negative_image_embeds=negative_image_emb,
                height=self.height,
                width=self.width,
                num_inference_steps=self.num_inference_steps,
                generator=generator,
                callback=progress_callback(self.id, self.num_inference_steps, context),
                callback_steps=1,
            )  # type: ignore
        else:
            input_image = await context.image_to_pil(self.image)
            output = self._pipeline(
                image=input_image,
                image_embeds=image_emb,
                negative_image_embeds=negative_image_emb,
                height=self.height,
                width=self.width,
                num_inference_steps=self.num_inference_steps,
                generator=generator,
                callback=progress_callback,
                callback_steps=1,
            )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class Kandinsky3Node(BaseNode):
    """
    Generates images using the Kandinsky-3 model. Provide image for img2img mode.
    image, generation, AI, text-to-image

    Use cases:
    - Create detailed images from text descriptions
    - Generate unique illustrations for creative projects
    - Produce visual content for digital media and art
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    width: int = Field(
        default=512, description="The width of the generated image.", ge=64, le=2048
    )
    height: int = Field(
        default=512, description="The height of the generated image.", ge=64, le=2048
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform (optional)",
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForText2Image | None = None

    async def initialize(self, context: ProcessingContext):
        if self.image.is_empty():
            self._pipeline = AutoPipelineForText2Image.from_pretrained(
                "kandinsky-community/kandinsky-3",
                variant="fp16",
                torch_dtype=torch.float16,
            )
        else:
            self._pipeline = AutoPipelineForImage2Image.from_pretrained(
                "kandinsky-community/kandinsky-3",
                variant="fp16",
                torch_dtype=torch.float16,
            )

        assert self._pipeline is not None

    async def move_to_device(self, device: str):
        # if self._pipeline is not None:
        #     self._pipeline.to(device)
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        if self.image.is_empty():
            output = self._pipeline(
                prompt=self.prompt,
                num_inference_steps=self.num_inference_steps,
                generator=generator,
                width=self.width,
                height=self.height,
                callback=progress_callback(self.id, self.num_inference_steps, context),
                callback_steps=1,
            )  # type: ignore
        else:
            input_image = await context.image_to_pil(self.image)
            output = self._pipeline(
                prompt=self.prompt,
                num_inference_steps=self.num_inference_steps,
                generator=generator,
                image=input_image,
                width=self.width,
                height=self.height,
                callback=progress_callback,
            )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class StableCascadeNode(BaseNode):
    """
    Generates images using the Stable Cascade model, which involves a two-stage process with a prior and a decoder.
    image, generation, AI, text-to-image

    Use cases:
    - Create high-quality images from text descriptions
    - Generate detailed illustrations for creative projects
    - Produce visual content for digital media and art
    """

    prompt: str = Field(
        default="an image of a shiba inu, donning a spacesuit and helmet",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="", description="A text prompt describing what to avoid in the image."
    )
    width: int = Field(
        default=1024, description="The width of the generated image.", ge=256, le=2048
    )
    height: int = Field(
        default=1024, description="The height of the generated image.", ge=256, le=2048
    )
    prior_num_inference_steps: int = Field(
        default=20,
        description="The number of denoising steps for the prior.",
        ge=1,
        le=100,
    )
    decoder_num_inference_steps: int = Field(
        default=10,
        description="The number of denoising steps for the decoder.",
        ge=1,
        le=100,
    )
    prior_guidance_scale: float = Field(
        default=4.0, description="Guidance scale for the prior.", ge=0.0, le=20.0
    )
    decoder_guidance_scale: float = Field(
        default=0.0, description="Guidance scale for the decoder.", ge=0.0, le=20.0
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _prior_pipeline: StableCascadePriorPipeline | None = None
    _decoder_pipeline: StableCascadeDecoderPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        self._prior_pipeline = StableCascadePriorPipeline.from_pretrained(
            "stabilityai/stable-cascade-prior",
            variant="bf16",
            torch_dtype=torch.bfloat16,
        )  # type: ignore
        self._decoder_pipeline = StableCascadeDecoderPipeline.from_pretrained(
            "stabilityai/stable-cascade", variant="bf16", torch_dtype=torch.float16
        )  # type: ignore

    async def move_to_device(self, device: str):
        # Commented out as we're using CPU offload
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._prior_pipeline is None or self._decoder_pipeline is None:
            raise ValueError("Pipelines not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        # Enable CPU offload for memory efficiency
        self._prior_pipeline.enable_model_cpu_offload()
        self._decoder_pipeline.enable_model_cpu_offload()

        # Generate image embeddings with the prior
        prior_output = self._prior_pipeline(
            prompt=self.prompt,
            height=self.height,
            width=self.width,
            negative_prompt=self.negative_prompt,
            guidance_scale=self.prior_guidance_scale,
            num_images_per_prompt=1,
            num_inference_steps=self.prior_num_inference_steps,
            generator=generator,
        )

        # Generate the final image with the decoder
        decoder_output = self._decoder_pipeline(
            image_embeddings=prior_output.image_embeddings.to(torch.float16),  # type: ignore
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            guidance_scale=self.decoder_guidance_scale,
            output_type="pil",
            num_inference_steps=self.decoder_num_inference_steps,
            generator=generator,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(decoder_output)


class SDXLTurbo(BaseNode):
    prompt: str = Field(default="", description="The prompt for image generation.")
    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation (optional).",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=1000000,
        description="Seed for the random number generator.",
    )
    num_inference_steps: int = Field(
        default=4, ge=1, le=50, description="Number of inference steps."
    )
    guidance_scale: float = Field(
        default=7.0, ge=0.0, le=20.0, description="Guidance scale for generation."
    )
    width: int = Field(
        default=1024, ge=64, le=2048, description="Width of the generated image."
    )
    height: int = Field(
        default=1024, ge=64, le=2048, description="Height of the generated image"
    )
    strength: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation.",
    )

    _pipe: Any = None

    @classmethod
    def get_title(cls):
        return "SDXL Turbo"

    async def initialize(self, context: ProcessingContext):
        if self._pipe is None:
            if self.init_image.is_empty():
                self._pipe = AutoPipelineForText2Image.from_pretrained(
                    "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
                )
            else:
                self._pipe = AutoPipelineForImage2Image.from_pretrained(
                    "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
                )

    async def move_to_device(self, device: str):
        if self._pipe is not None:
            self._pipe.to(device)

    async def process(self, context) -> ImageRef:
        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        if self.init_image.is_empty():
            # Text-to-Image generation
            image = self._pipe(
                prompt=self.prompt,
                num_inference_steps=self.num_inference_steps,
                guidance_scale=self.guidance_scale,
                width=self.width,
                height=self.height,
                callback=progress_callback(self.id, self.num_inference_steps, context),
                callback_steps=1,
                generator=generator,
            ).images[0]
        else:
            # Image-to-Image generation
            init_image = await context.image_to_pil(self.init_image)
            init_image = init_image.resize((self.width, self.height))
            image = self._pipe(
                prompt=self.prompt,
                image=init_image,
                width=self.width,
                height=self.height,
                num_inference_steps=self.num_inference_steps,
                strength=self.strength,
                guidance_scale=self.guidance_scale,
                callback=progress_callback(self.id, self.num_inference_steps, context),
                callback_steps=1,
                generator=generator,
            ).images[0]

        # Convert PIL Image to ImageRef
        print(image)
        return await context.image_from_pil(image)


class StableDiffusion3ControlNetNode(BaseNode):
    """
    Generates images using Stable Diffusion 3 with ControlNet.
    image, generation, AI, text-to-image, controlnet

    Use cases:
    - Generate images with precise control over composition and structure
    - Create variations of existing images while maintaining specific features
    - Artistic image generation with guided outputs
    """

    class StableDiffusion3ControlNetModelId(str, Enum):
        SD3_CONTROLNET_CANNY = "InstantX/SD3-Controlnet-Canny"
        SD3_CONTROLNET_TILE = "InstantX/SD3-Controlnet-Tile"
        SD3_CONTROLNET_POSE = "InstantX/SD3-Controlnet-Pose"

    prompt: str = Field(
        default="A girl holding a sign that says InstantX",
        description="A text prompt describing the desired image.",
    )
    control_model: StableDiffusion3ControlNetModelId = Field(
        default=StableDiffusion3ControlNetModelId.SD3_CONTROLNET_CANNY,
        description="The ControlNet model to use for image generation.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the generation process.",
    )
    controlnet_conditioning_scale: float = Field(
        default=0.7,
        description="The scale of the ControlNet conditioning.",
        ge=0.0,
        le=1.0,
    )
    num_inference_steps: int = Field(
        default=30,
        description="The number of denoising steps.",
        ge=1,
        le=100,
    )
    width: int = Field(
        default=512,
        description="The width of the generated image.",
        ge=64,
        le=2048,
    )
    height: int = Field(
        default=512,
        description="The height of the generated image.",
        ge=64,
        le=2048,
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: StableDiffusion3ControlNetPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        controlnet = SD3ControlNetModel.from_pretrained(
            self.control_model.value, torch_dtype=torch.float16
        )
        self._pipeline = StableDiffusion3ControlNetPipeline.from_pretrained(
            "stabilityai/stable-diffusion-3-medium-diffusers",
            controlnet=controlnet,
            torch_dtype=torch.float16,
        )  # type: ignore

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device=self._pipeline.device).manual_seed(
                self.seed
            )

        # Load the control image
        control_image = await context.image_to_pil(self.control_image)

        def callback(pipe: Any, step: int, timestep: int, args: dict):
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )
            return {}

        # Generate the image
        self._pipeline.enable_model_cpu_offload()

        output = self._pipeline(
            prompt=self.prompt,
            control_image=control_image,
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            num_inference_steps=self.num_inference_steps,
            width=self.width,
            height=self.height,
            generator=generator,
            callback_on_step_end=callback,  # type: ignore
        )

        # Convert the output image to ImageRef
        return await context.image_from_pil(output.images[0])  # type: ignore
