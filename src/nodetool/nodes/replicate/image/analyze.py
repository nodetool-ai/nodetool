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
    def get_basic_fields(cls):
        return ["mode", "image"]

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/sdxl-clip-interrogator:b8dd624ad312d215250b362af0ecff05d7ad4f8270f9beb034c483d70682e7b3"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/c200f919-4cc1-412b-8edf-e2863a5eef56/replicate-sdxl-inter.png",
            "created_at": "2023-08-14T20:06:38.402771Z",
            "description": "CLIP Interrogator for SDXL optimizes text prompts to match a given image",
            "github_url": "https://github.com/lucataco/cog-sdxl-clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "sdxl-clip-interrogator",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 845652,
            "url": "https://replicate.com/lucataco/sdxl-clip-interrogator",
            "visibility": "public",
            "weights_url": None,
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
    def get_basic_fields(cls):
        return ["image"]

    @classmethod
    def replicate_model_id(cls):
        return "methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/504b1747-8c67-438b-b02f-a6ea9254589d/a_high_detail_shot_of_a_cat_we.png",
            "created_at": "2022-08-24T08:53:28.614572Z",
            "description": "Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))",
            "github_url": "https://github.com/pharmapsychotic/clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "img2prompt",
            "owner": "methexis-inc",
            "paper_url": None,
            "run_count": 2640193,
            "url": "https://replicate.com/methexis-inc/img2prompt",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")


class Moondream2(ReplicateNode):
    """moondream2 is a small vision language model designed to run efficiently on edge devices"""

    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt"]

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/dc0dc539-f592-4c34-b24f-2d112f742975/moondream2.png",
            "created_at": "2024-03-05T02:29:40.377800Z",
            "description": "moondream2 is a small vision language model designed to run efficiently on edge devices",
            "github_url": "https://github.com/lucataco/cog-moondream2",
            "license_url": "https://github.com/vikhyat/moondream?tab=Apache-2.0-1-ov-file#readme",
            "name": "moondream2",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 242366,
            "url": "https://replicate.com/lucataco/moondream2",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return str

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    prompt: str = Field(
        title="Prompt", description="Input prompt", default="Describe this image"
    )


class NSFWImageDetection(ReplicateNode):
    """Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification"""

    @classmethod
    def get_basic_fields(cls):
        return ["image"]

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/nsfw_image_detection:97116600cabd3037e5f22ca08ffcc33b92cfacebf7ccd3609e9c1d29e43d3a8d"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/JurYNQcIfISvpS6WtaOcwZXw1ifEudlLyQqiLj5N1Zq977Q3/falcon.jpg",
            "created_at": "2023-11-21T14:53:34.798862Z",
            "description": "Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification",
            "github_url": "https://github.com/lucataco/cog-nsfw_image_detection",
            "license_url": "https://huggingface.co/models?license=license:apache-2.0",
            "name": "nsfw_image_detection",
            "owner": "falcons-ai",
            "paper_url": "https://arxiv.org/abs/2010.11929",
            "run_count": 41917944,
            "url": "https://replicate.com/falcons-ai/nsfw_image_detection",
            "visibility": "public",
            "weights_url": "https://huggingface.co/Falconsai/nsfw_image_detection",
        }

    @classmethod
    def return_type(cls):
        return str

    image: str | None = Field(title="Image", description="Input image", default=None)


class Blip(ReplicateNode):
    """Generate image captions"""

    class Task(str, Enum):
        IMAGE_CAPTIONING = "image_captioning"
        VISUAL_QUESTION_ANSWERING = "visual_question_answering"
        IMAGE_TEXT_MATCHING = "image_text_matching"

    @classmethod
    def get_basic_fields(cls):
        return ["task", "image", "caption"]

    @classmethod
    def replicate_model_id(cls):
        return "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/b59b459c-c475-414f-ba67-c424a7e6e6ca/demo.jpg",
            "created_at": "2022-02-06T17:40:38.855280Z",
            "description": "Generate image captions",
            "github_url": "https://github.com/salesforce/BLIP",
            "license_url": "https://github.com/salesforce/BLIP/blob/main/LICENSE.txt",
            "name": "blip",
            "owner": "salesforce",
            "paper_url": "https://arxiv.org/abs/2201.12086",
            "run_count": 122049964,
            "url": "https://replicate.com/salesforce/blip",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return str

    task: Task = Field(description="Choose a task.", default=Task("image_captioning"))
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

    @classmethod
    def get_basic_fields(cls):
        return ["image", "caption", "context"]

    @classmethod
    def replicate_model_id(cls):
        return "andreasjansson/blip-2:f677695e5e89f8b236e52ecd1d3f01beb44c34606419bcc19345e046d8f786f9"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/031b9aee-ed15-4429-a7e4-813b72e9edc5/gg_bridge.jpeg",
            "created_at": "2023-02-13T07:06:23.521189Z",
            "description": "Answers questions about images",
            "github_url": "https://github.com/daanelson/cog-blip-2",
            "license_url": None,
            "name": "blip-2",
            "owner": "andreasjansson",
            "paper_url": "https://arxiv.org/abs/2301.12597",
            "run_count": 29051671,
            "url": "https://replicate.com/andreasjansson/blip-2",
            "visibility": "public",
            "weights_url": None,
        }

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
    def get_basic_fields(cls):
        return ["mode", "image", "clip_model_name"]

    @classmethod
    def replicate_model_id(cls):
        return "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9eba05b11c7f450155102af70"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/HrXsgowfhbZi3dImGZoIcvnz7oZfMtFY4UAEU8vBIakTd8JQ/watercolour-4799014_960_720.jpg",
            "created_at": "2022-10-28T17:47:38.473429Z",
            "description": "The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!",
            "github_url": "https://github.com/pharmapsychotic/clip-interrogator",
            "license_url": "https://github.com/pharmapsychotic/clip-interrogator/blob/main/LICENSE",
            "name": "clip-interrogator",
            "owner": "pharmapsychotic",
            "paper_url": None,
            "run_count": 2936158,
            "url": "https://replicate.com/pharmapsychotic/clip-interrogator",
            "visibility": "public",
            "weights_url": None,
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
    def get_basic_fields(cls):
        return ["image", "top_p", "prompt"]

    @classmethod
    def replicate_model_id(cls):
        return "yorickvp/llava-13b:80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/454548d6-4978-4d85-bca3-d067dfc031bf/llava.png",
            "created_at": "2023-10-09T16:27:51.777748Z",
            "description": "Visual instruction tuning towards large language and vision models with GPT-4 level capabilities",
            "github_url": "https://github.com/haotian-liu/LLaVA",
            "license_url": "https://ai.meta.com/llama/license/",
            "name": "llava-13b",
            "owner": "yorickvp",
            "paper_url": "https://arxiv.org/abs/2310.03744",
            "run_count": 21141699,
            "url": "https://replicate.com/yorickvp/llava-13b",
            "visibility": "public",
            "weights_url": None,
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
    def get_basic_fields(cls):
        return ["inputs"]

    @classmethod
    def replicate_model_id(cls):
        return "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/07d242b3-4246-4da2-9522-b4ad134336fc/clip_image.png",
            "created_at": "2022-09-22T20:23:55.682616Z",
            "description": "Return CLIP features for the clip-vit-large-patch14 model",
            "github_url": "https://github.com/andreasjansson/cog-clip",
            "license_url": None,
            "name": "clip-features",
            "owner": "andreasjansson",
            "paper_url": None,
            "run_count": 71642394,
            "url": "https://replicate.com/andreasjansson/clip-features",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return list[dict]

    inputs: str = Field(
        title="Inputs",
        description="Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://",
        default="a\nb",
    )
