from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Mode(str, Enum):
    BEST = "best"
    FAST = "fast"


class SDXLClipInterrogator(ReplicateNode):
    """CLIP Interrogator for SDXL optimizes text prompts to match a given image"""

    def replicate_model_id(self):
        return "lucataco/sdxl-clip-interrogator:d90ed1292165dbad1fc3fc8ce26c3a695d6a211de00e2bb5f5fec4815ea30e4c"

    def get_hardware(self):
        return "Nvidia A40 GPU"

    @classmethod
    def return_type(cls):
        return str

    mode: Mode = Field(
        description="Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds.",
        default="best",
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")


class Moondream2(ReplicateNode):
    """moondream2 is a small vision language model designed to run efficiently on edge devices"""

    def replicate_model_id(self):
        return "lucataco/moondream2:392a53ac3f36d630d2d07ce0e78142acaccc338d6caeeb8ca552fe5baca2781e"

    def get_hardware(self):
        return "Nvidia A40 GPU"

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    prompt: str = Field(
        title="Prompt", description="Input prompt", default="Describe this image"
    )


class MiniGPT4(ReplicateNode):
    """A model which generates text in response to an input image and prompt."""

    def replicate_model_id(self):
        return "daanelson/minigpt-4:b96a2f33cc8e4b0aa23eacfce731b9c41a7d9466d9ed4e167375587b54db9423"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return str

    image: str | None = Field(
        title="Image", description="Image to discuss", default=None
    )
    top_p: float = Field(
        title="Top P",
        description="Sample from the top p percent most likely tokens",
        ge=0.0,
        le=1.0,
        default=0.9,
    )
    prompt: str | None = Field(
        title="Prompt",
        description="Prompt for mini-gpt4 regarding input image",
        default=None,
    )
    num_beams: int = Field(
        title="Num Beams",
        description="Number of beams for beam search decoding",
        ge=1.0,
        le=10.0,
        default=3,
    )
    max_length: int = Field(
        title="Max Length",
        description="Total length of prompt and output in tokens",
        ge=1.0,
        default=4000,
    )
    temperature: float = Field(
        title="Temperature",
        description="Temperature for generating tokens, lower = more predictable results",
        ge=0.01,
        le=2.0,
        default=1,
    )
    max_new_tokens: int = Field(
        title="Max New Tokens",
        description="Maximum number of new tokens to generate",
        ge=1.0,
        default=3000,
    )
    repetition_penalty: float = Field(
        title="Repetition Penalty",
        description="Penalty for repeated words in generated text; 1 is no penalty, values greater than 1 discourage repetition, less than 1 encourage it.",
        ge=0.01,
        le=5.0,
        default=1,
    )


class NSFWImageDetection(ReplicateNode):
    """Falcons.ai Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification"""

    def replicate_model_id(self):
        return "lucataco/nsfw_image_detection:97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return str

    image: str | None = Field(title="Image", description="Input image", default=None)


class Llava34B(ReplicateNode):
    """LLaVA v1.6: Large Language and Vision Assistant (Nous-Hermes-2-34B)"""

    def replicate_model_id(self):
        return "yorickvp/llava-v1.6-34b:41ecfbfb261e6c1adf3ad896c9066ca98346996d7c4045c5bc944a79d430f174"

    def get_hardware(self):
        return "Nvidia A100 (80GB) GPU"

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    top_p: float = Field(
        title="Top P",
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens",
        ge=0.0,
        le=1.0,
        default=1,
    )
    prompt: str | None = Field(
        title="Prompt", description="Prompt to use for text generation", default=None
    )
    history: list | None = Field(
        title="History",
        description="List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to.",
        default=None,
    )
    max_tokens: int = Field(
        title="Max Tokens",
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens",
        ge=0.0,
        default=1024,
    )
    temperature: float = Field(
        title="Temperature",
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic",
        ge=0.0,
        default=0.2,
    )


class Task(str, Enum):
    IMAGE_CAPTIONING = "image_captioning"
    VISUAL_QUESTION_ANSWERING = "visual_question_answering"
    IMAGE_TEXT_MATCHING = "image_text_matching"


class Blip(ReplicateNode):
    """Bootstrapping Language-Image Pre-training"""

    def replicate_model_id(self):
        return "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return str

    task: Task = Field(description="Choose a task.", default="image_captioning")
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    caption: str | None = Field(
        title="Caption",
        description="Type caption for the input image for image text matching task.",
        default=None,
    )
    question: str | None = Field(
        title="Question",
        description="Type question for the input image for visual question answering task.",
        default=None,
    )


class Blip2(ReplicateNode):
    """Answers questions about images"""

    def replicate_model_id(self):
        return "andreasjansson/blip-2:f677695e5e89f8b236e52ecd1d3f01beb44c34606419bcc19345e046d8f786f9"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(
        default=ImageRef(), description="Input image to query or caption"
    )
    caption: bool = Field(
        title="Caption",
        description="Select if you want to generate image captions instead of asking questions",
        default=False,
    )
    context: str | None = Field(
        title="Context",
        description="Optional - previous questions and answers to be used as context for answering current question",
        default=None,
    )
    question: str = Field(
        title="Question",
        description="Question to ask about this image. Leave blank for captioning",
        default="What is this a picture of?",
    )
    temperature: float = Field(
        title="Temperature",
        description="Temperature for use with nucleus sampling",
        ge=0.5,
        le=1.0,
        default=1,
    )
    use_nucleus_sampling: bool = Field(
        title="Use Nucleus Sampling",
        description="Toggles the model using nucleus sampling to generate responses",
        default=False,
    )


class Clip_model_name(str, Enum):
    VIT_L_14_OPENAI = "ViT-L-14/openai"
    VIT_H_14_LAION2B_S32B_B79K = "ViT-H-14/laion2b_s32b_b79k"
    VIT_BIGG_14_LAION2B_S39B_B160K = "ViT-bigG-14/laion2b_s39b_b160k"


class ClipInterrogator(ReplicateNode):
    """The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!"""

    def replicate_model_id(self):
        return "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9eba05b11c7f450155102af70"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return str

    mode: Mode = Field(
        description="Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds).",
        default="best",
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    clip_model_name: Clip_model_name = Field(
        description="Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL.",
        default="ViT-L-14/openai",
    )


class Llava13b(ReplicateNode):
    """Visual instruction tuning towards large language and vision models with GPT-4 level capabilities"""

    def replicate_model_id(self):
        return "yorickvp/llava-13b:b5f6212d032508382d61ff00469ddda3e32fd8a0e75dc39d8a4191bb742157fb"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    top_p: float = Field(
        title="Top P",
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens",
        ge=0.0,
        le=1.0,
        default=1,
    )
    prompt: str | None = Field(
        title="Prompt", description="Prompt to use for text generation", default=None
    )
    max_tokens: int = Field(
        title="Max Tokens",
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens",
        ge=0.0,
        default=1024,
    )
    temperature: float = Field(
        title="Temperature",
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic",
        ge=0.0,
        default=0.2,
    )
