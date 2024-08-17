from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class SDXLClipInterrogator(ReplicateNode):
    """CLIP Interrogator for SDXL optimizes text prompts to match a given image"""

    class Mode(str, Enum):
        BEST = "best"
        FAST = "fast"

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/sdxl-clip-interrogator:b8dd624ad312d215250b362af0ecff05d7ad4f8270f9beb034c483d70682e7b3"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/c200f919-4cc1-412b-8edf-e2863a5eef56/replicate-sdxl-inter.png",
            "created_at": "2023-08-14T20:06:38.402771Z",
            "description": "CLIP Interrogator for SDXL optimizes text prompts to match a given image",
            "github_url": "https://github.com/lucataco/cog-sdxl-clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "sdxl-clip-interrogator",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 840052,
            "url": "https://replicate.com/lucataco/sdxl-clip-interrogator",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    mode: Mode = Field(
        description="Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds.",
        default=Mode("best"),
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")


class Img2Prompt(ReplicateNode):
    """Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))"""

    @classmethod
    def replicate_model_id(cls):
        return "methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/8b4d747d-feca-477d-8069-ee4d5f89ad8e/a_high_detail_shot_of_a_cat_wearing_a_suit_realism_8k_-n_9_.png",
            "created_at": "2022-08-24T08:53:28.614572Z",
            "description": "Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))",
            "github_url": "https://github.com/pharmapsychotic/clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "img2prompt",
            "owner": "methexis-inc",
            "paper_url": None,
            "run_count": 2590067,
            "url": "https://replicate.com/methexis-inc/img2prompt",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")


class Moondream2(ReplicateNode):
    """moondream2 is a small vision language model designed to run efficiently on edge devices"""

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/moondream2:392a53ac3f36d630d2d07ce0e78142acaccc338d6caeeb8ca552fe5baca2781e"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/3cbb4e68-08b8-4e82-8e83-3300f877dd0f/moondream2.png",
            "created_at": "2024-03-05T02:29:40.377800Z",
            "description": "moondream2 is a small vision language model designed to run efficiently on edge devices",
            "github_url": "https://github.com/lucataco/cog-moondream2",
            "license_url": "https://github.com/vikhyat/moondream?tab=Apache-2.0-1-ov-file#readme",
            "name": "moondream2",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 65100,
            "url": "https://replicate.com/lucataco/moondream2",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    prompt: str = Field(
        title="Prompt", description="Input prompt", default="Describe this image"
    )


class MiniGPT4(ReplicateNode):
    """A model which generates text in response to an input image and prompt."""

    @classmethod
    def replicate_model_id(cls):
        return "daanelson/minigpt-4:e447a8583cffd86ce3b93f9c2cd24f2eae603d99ace6afa94b33a08e94a3cd06"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/af717919-83de-46e8-9b1a-9c66f4f747bf/out_0.png",
            "created_at": "2023-05-16T19:05:24.691944Z",
            "description": "A model which generates text in response to an input image and prompt.",
            "github_url": "https://github.com/daanelson/MiniGPT-4",
            "license_url": "https://github.com/Vision-CAIR/MiniGPT-4/blob/main/LICENSE.md",
            "name": "minigpt-4",
            "owner": "daanelson",
            "paper_url": "https://arxiv.org/pdf/2304.10592.pdf",
            "run_count": 1343562,
            "url": "https://replicate.com/daanelson/minigpt-4",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Image to discuss")
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


class GLM_4V_9B(ReplicateNode):
    """GLM-4V is a multimodal model competitive with GPT-4o and other top models."""

    @classmethod
    def replicate_model_id(cls):
        return "cuuupid/glm-4v-9b:a75c919339f65bf00afa96511af653fdbd0ec3cb0f5e6f4350809445eee0e14f"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/L4xKZdxJyTzXJWgiLgvyaeHHhKvZDu2TdTukDoUKMC6eMRxD/replicate-prediction-3a2y5bv2e1rgg0cfxqysh6g9v0%20(1).png",
            "created_at": "2024-06-11T17:01:39.744025Z",
            "description": "GLM-4V is a multimodal model competitive with GPT-4o and other top models.",
            "github_url": "https://github.com/THUDM/GLM-4",
            "license_url": "https://huggingface.co/THUDM/glm-4-9b/blob/main/LICENSE",
            "name": "glm-4v-9b",
            "owner": "cuuupid",
            "paper_url": None,
            "run_count": 699,
            "url": "https://replicate.com/cuuupid/glm-4v-9b",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Image input")
    prompt: str | None = Field(title="Prompt", description="Propmt", default=None)


class NSFWImageDetection(ReplicateNode):
    """Falcons.ai Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification"""

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/nsfw_image_detection:97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/JurYNQcIfISvpS6WtaOcwZXw1ifEudlLyQqiLj5N1Zq977Q3/falcon.jpg",
            "created_at": "2023-11-21T14:53:34.798862Z",
            "description": "Falcons.ai Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification",
            "github_url": "https://github.com/lucataco/cog-nsfw_image_detection",
            "license_url": "https://huggingface.co/models?license=license:apache-2.0",
            "name": "nsfw_image_detection",
            "owner": "lucataco",
            "paper_url": "https://huggingface.co/papers/2010.11929",
            "run_count": 1748854,
            "url": "https://replicate.com/lucataco/nsfw_image_detection",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image: str | None = Field(title="Image", description="Input image", default=None)


class Llava34B(ReplicateNode):
    """LLaVA v1.6: Large Language and Vision Assistant (Nous-Hermes-2-34B)"""

    @classmethod
    def replicate_model_id(cls):
        return "yorickvp/llava-v1.6-34b:41ecfbfb261e6c1adf3ad896c9066ca98346996d7c4045c5bc944a79d430f174"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (80GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/c6163ba0-edfc-4b53-9a23-eab7fd08b28a/b14df1cd-2e49-4e6b-b965-0deea7c1.webp",
            "created_at": "2024-02-01T14:41:55.242062Z",
            "description": "LLaVA v1.6: Large Language and Vision Assistant (Nous-Hermes-2-34B)",
            "github_url": "https://github.com/haotian-liu/LLaVA",
            "license_url": "https://huggingface.co/NousResearch/Nous-Hermes-2-Yi-34B",
            "name": "llava-v1.6-34b",
            "owner": "yorickvp",
            "paper_url": None,
            "run_count": 1385384,
            "url": "https://replicate.com/yorickvp/llava-v1.6-34b",
            "visibility": "public",
            "hardware": "Nvidia A100 (80GB) GPU",
        }

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
    history: list = Field(
        title="History",
        description="List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to.",
        default_factory=list,
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


class ClipInterrogator(ReplicateNode):
    """The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!"""

    class Mode(str, Enum):
        BEST = "best"
        CLASSIC = "classic"
        FAST = "fast"
        NEGATIVE = "negative"

    class Clip_model_name(str, Enum):
        VIT_L_14_OPENAI = "ViT-L-14/openai"
        VIT_H_14_LAION2B_S32B_B79K = "ViT-H-14/laion2b_s32b_b79k"
        VIT_BIGG_14_LAION2B_S39B_B160K = "ViT-bigG-14/laion2b_s39b_b160k"

    @classmethod
    def replicate_model_id(cls):
        return "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9eba05b11c7f450155102af70"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/HrXsgowfhbZi3dImGZoIcvnz7oZfMtFY4UAEU8vBIakTd8JQ/watercolour-4799014_960_720.jpg",
            "created_at": "2022-10-28T17:47:38.473429Z",
            "description": "The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!",
            "github_url": "https://github.com/pharmapsychotic/clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "clip-interrogator",
            "owner": "pharmapsychotic",
            "paper_url": None,
            "run_count": 1857156,
            "url": "https://replicate.com/pharmapsychotic/clip-interrogator",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    mode: Mode = Field(
        description="Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds).",
        default=Mode("best"),
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    clip_model_name: Clip_model_name = Field(
        description="Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL.",
        default=Clip_model_name("ViT-L-14/openai"),
    )


class Llava13b(ReplicateNode):
    """Visual instruction tuning towards large language and vision models with GPT-4 level capabilities"""

    @classmethod
    def replicate_model_id(cls):
        return "yorickvp/llava-13b:b5f6212d032508382d61ff00469ddda3e32fd8a0e75dc39d8a4191bb742157fb"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/2c5dbfff-209d-4ab5-a294-b3e5e56105c0/dalle3.jpg",
            "created_at": "2023-10-09T16:27:51.777748Z",
            "description": "Visual instruction tuning towards large language and vision models with GPT-4 level capabilities",
            "github_url": "https://github.com/haotian-liu/LLaVA",
            "license_url": "https://ai.meta.com/llama/license/",
            "name": "llava-13b",
            "owner": "yorickvp",
            "paper_url": "https://arxiv.org/abs/2310.03744",
            "run_count": 9322203,
            "url": "https://replicate.com/yorickvp/llava-13b",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

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


class ClipFeatures(ReplicateNode):
    """Return CLIP features for the clip-vit-large-patch14 model"""

    @classmethod
    def replicate_model_id(cls):
        return "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/21f9d2a0-bb57-4c32-9bee-67784c9d6a76/clip_image.png",
            "created_at": "2022-09-22T20:23:55.682616Z",
            "description": "Return CLIP features for the clip-vit-large-patch14 model",
            "github_url": "https://github.com/andreasjansson/cog-clip",
            "license_url": None,
            "name": "clip-features",
            "owner": "andreasjansson",
            "paper_url": None,
            "run_count": 57962795,
            "url": "https://replicate.com/andreasjansson/clip-features",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return list[dict]

    inputs: str = Field(
        title="Inputs",
        description="Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://",
        default="a\nb",
    )
