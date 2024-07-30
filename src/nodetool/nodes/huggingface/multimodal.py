import asyncio
from enum import Enum
from typing import Any

from pydantic import Field
from nodetool.metadata.types import ImageRef, Tensor
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext

class FeaturesExtraction(HuggingFacePipelineNode):
    """
    Extracts features from text using pre-trained models.
    text, feature extraction, embeddings, natural language processing

    Use cases:
    - Text similarity comparison
    - Clustering text documents
    - Input for machine learning models
    - Semantic search applications
    """

    class FeaturesExtractionModelId(str, Enum):
        SENTENCE_TRANSFORMERS_ALL_MPNET_BASE_V2 = "sentence-transformers/all-mpnet-base-v2"
        SENTENCE_TRANSFORMERS_ALL_MINILM_L6_V2 = "sentence-transformers/all-MiniLM-L6-v2"
        DISTILBERT_BASE_UNCASED = "distilbert-base-uncased"
        BERT_BASE_UNCASED = "bert-base-uncased"

    model: FeaturesExtractionModelId = Field(
        default=FeaturesExtractionModelId.SENTENCE_TRANSFORMERS_ALL_MPNET_BASE_V2,
        title="Model ID on Huggingface",
        description="The model ID to use for feature extraction",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to extract features from",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'feature-extraction'

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> Tensor:
        return await self.process_local_result(context, result)

    async def process_local_result(self, context: ProcessingContext, result: Any) -> Tensor:
        # The result is typically a list of lists, where each inner list represents the features for a token
        # We'll return the mean of these features to get a single vector for the entire input
        import numpy as np
        return Tensor.from_numpy(np.mean(result[0], axis=0))

    async def process(self, context: ProcessingContext) -> list[float]:
        return await super().process(context)

# throws an error
# class DocumentQuestionAnswering(HuggingFacePipelineNode):
#     """
#     Answers questions based on a given document.
#     text, question answering, document, natural language processing

#     Use cases:
#     - Information retrieval from long documents
#     - Automated document analysis
#     - Enhancing search functionality in document repositories
#     - Assisting in research and data extraction tasks
#     """

#     class DocumentQuestionAnsweringModelId(str, Enum):
#         IMPIRA_LAYOUTLM_DOCUMENT_QA = "impira/layoutlm-document-qa"

#     model: DocumentQuestionAnsweringModelId = Field(
#         default=DocumentQuestionAnsweringModelId.IMPIRA_LAYOUTLM_DOCUMENT_QA,
#         title="Model ID on Huggingface",
#         description="The model ID to use for document question answering",
#     )
#     image: ImageRef = Field(
#         default=ImageRef(),
#         title="Document Image",
#         description="The image of the document to analyze",
#     )
#     question: str = Field(
#         default="",
#         title="Question",
#         description="The question to be answered based on the document",
#     )

#     def get_model_id(self):
#         return self.model.value
    
#     async def get_inputs(self, context: ProcessingContext):
#         image = await context.image_to_pil(self.image)
#         return {
#             "image": image,
#             "question": self.question,
#         }

#     @property
#     def pipeline_task(self) -> str:
#         return 'document-question-answering'

#     async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, Any]:
#         return await self.process_local_result(context, result)

#     async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, Any]:
#         return {
#             "answer": result["answer"],
#             "score": result["score"],
#         }

#     async def process(self, context: ProcessingContext) -> dict[str, Any]:
#         return await super().process(context)


class ImageFeatureExtraction(HuggingFacePipelineNode):
    """
    Extracts features from images using pre-trained models.
    image, feature extraction, embeddings, computer vision

    Use cases:
    - Image similarity comparison
    - Clustering images
    - Input for machine learning models
    - Content-based image retrieval
    """

    class ImageFeatureExtractionModelId(str, Enum):
        MICROSOFT_RESNET_50 = "microsoft/resnet-50"
        GOOGLE_VIT_BASE_PATCH16_224 = "google/vit-base-patch16-224"
        FACEBOOK_CONVNEXT_BASE_224 = "facebook/convnext-base-224"
        OPENAI_CLIP_VIT_BASE_PATCH32 = "openai/clip-vit-base-patch32"

    model: ImageFeatureExtractionModelId = Field(
        default=ImageFeatureExtractionModelId.MICROSOFT_RESNET_50,
        title="Model ID on Huggingface",
        description="The model ID to use for image feature extraction",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to extract features from",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'image-feature-extraction'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> Tensor:
        return await self.process_local_result(context, result)

    async def process_local_result(self, context: ProcessingContext, result: Any) -> Tensor:
        # The result is typically a list with a single numpy array
        # We'll return this array as a Tensor
        import numpy as np
        return Tensor.from_numpy(np.array(result[0]))

    async def process(self, context: ProcessingContext) -> Tensor:
        return await super().process(context)
    

class ImageToText(HuggingFacePipelineNode):
    """
    Generates text descriptions from images.
    image, text, captioning, vision-language

    Use cases:
    - Automatic image captioning
    - Assisting visually impaired users
    - Enhancing image search capabilities
    - Generating alt text for web images
    """

    class ImageToTextModelId(str, Enum):
        MICROSOFT_GIT_BASE_COCO = "microsoft/git-base-coco"
        NLPCONNECT_VIT_GPT2_IMAGE_CAPTIONING = "nlpconnect/vit-gpt2-image-captioning"
        SALESFORCE_BLIP_IMAGE_CAPTIONING_BASE = "Salesforce/blip-image-captioning-base"
        SALESFORCE_BLIP_IMAGE_CAPTIONING_LARGE = "Salesforce/blip-image-captioning-large"

    model: ImageToTextModelId = Field(
        default=ImageToTextModelId.MICROSOFT_GIT_BASE_COCO,
        title="Model ID on Huggingface",
        description="The model ID to use for image-to-text generation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to generate text from",
    )
    max_new_tokens: int = Field(
        default=50,
        title="Max New Tokens",
        description="The maximum number of tokens to generate",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'image-to-text'

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "max_new_tokens": self.max_new_tokens,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['generated_text']

    async def process_local_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['generated_text']

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class MaskGeneration(HuggingFacePipelineNode):
    """
    Generates masks for images using segmentation models.
    image, segmentation, mask generation, computer vision

    Use cases:
    - Object segmentation in images
    - Background removal
    - Image editing and manipulation
    - Scene understanding and analysis
    """

    class MaskGenerationModelId(str, Enum):
        FACEBOOK_SAM_VIT_BASE = "facebook/sam-vit-base"
        FACEBOOK_SAM_VIT_HUGE = "facebook/sam-vit-huge"
        FACEBOOK_SAM_VIT_LARGE = "facebook/sam-vit-large"

    model: MaskGenerationModelId = Field(
        default=MaskGenerationModelId.FACEBOOK_SAM_VIT_BASE,
        title="Model ID on Huggingface",
        description="The model ID to use for mask generation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to generate masks for",
    )
    points_per_side: int = Field(
        default=32,
        title="Points per Side",
        description="Number of points to be sampled along each side of the image",
        ge=1,
        le=64,
    )
    
    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'mask-generation'

    def get_params(self):
        return {
            "points_per_side": self.points_per_side,
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> list[ImageRef]:
        return await self.process_local_result(context, result)

    async def process_local_result(self, context: ProcessingContext, result: Any) -> list[ImageRef]:
        return await asyncio.gather(*[context.image_from_numpy(mask) for mask in result['masks']])

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        return await super().process(context)
    

class VisualQuestionAnswering(HuggingFacePipelineNode):
    """
    Answers questions about images.
    image, text, question answering, multimodal

    Use cases:
    - Image content analysis
    - Automated image captioning
    - Visual information retrieval
    - Accessibility tools for visually impaired users
    """

    class VisualQuestionAnsweringModelId(str, Enum):
        MICROSOFT_GIT_BASE_TEXTVQA = "microsoft/git-base-textvqa"
        DANDELIN_VLT5_BASE_FINETUNED_VQA = "dandelin/vilt-b32-finetuned-vqa"
        SALEFORCE_BLIP_VQA_BASE = "Salesforce/blip-vqa-base"

    model: VisualQuestionAnsweringModelId = Field(
        default=VisualQuestionAnsweringModelId.MICROSOFT_GIT_BASE_TEXTVQA,
        title="Model ID on Huggingface",
        description="The model ID to use for visual question answering",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The image to analyze",
    )
    question: str = Field(
        default="",
        title="Question",
        description="The question to be answered about the image",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'visual-question-answering'

    async def get_inputs(self, context: ProcessingContext):
        image = await context.image_to_pil(self.image)
        return {
            "image": image,
            "question": self.question,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['answer']

    async def process_local_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['answer']

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)