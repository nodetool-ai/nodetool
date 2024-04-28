from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Pixel(str, Enum):
    _512___512 = "512 * 512"
    _768___768 = "768 * 768"
    _1024___1024 = "1024 * 1024"


class Product_size(str, Enum):
    ORIGINAL = "Original"
    _0_6___WIDTH = "0.6 * width"
    _0_5___WIDTH = "0.5 * width"
    _0_4___WIDTH = "0.4 * width"
    _0_3___WIDTH = "0.3 * width"
    _0_2___WIDTH = "0.2 * width"


class AdInpaint(ReplicateNode):
    """Product advertising image generator"""

    def replicate_model_id(self):
        return "logerzhu/ad-inpaint:b1c17d148455c1fda435ababe9ab1e03bc0d917cc3cf4251916f22c45c83c7df"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    pixel: Pixel = Field(description="image total pixel", default="512 * 512")
    scale: int = Field(
        title="Scale",
        description="Factor to scale image by (maximum: 4)",
        ge=0.0,
        le=4.0,
        default=3,
    )
    prompt: str | None = Field(
        title="Prompt", description="Product name or prompt", default=None
    )
    image_num: int = Field(
        title="Image Num",
        description="Number of image to generate",
        ge=0.0,
        le=4.0,
        default=1,
    )
    image_path: ImageRef = Field(default=ImageRef(), description="input image")
    manual_seed: int = Field(title="Manual Seed", description="Manual Seed", default=-1)
    product_size: Product_size = Field(
        description="Max product size", default="Original"
    )
    guidance_scale: float = Field(
        title="Guidance Scale", description="Guidance Scale", default=7.5
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Anything you don't want in the photo",
        default="low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement",
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps", description="Inference Steps", default=20
    )


class Scheduler(str, Enum):
    DDIM = "DDIM"
    DPMSOLVERMULTISTEP = "DPMSolverMultistep"
    HEUNDISCRETE = "HeunDiscrete"
    KARRASDPM = "KarrasDPM"
    K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
    K_EULER = "K_EULER"
    PNDM = "PNDM"
    DPM__2MSDE = "DPM++2MSDE"


class Proteus(ReplicateNode):
    """ProteusV0.4: The Style Update"""

    def replicate_model_id(self):
        return "lucataco/proteus-v0.4:34a427535a3c45552b94369280b823fcd0e5c9710e97af020bf445c033d4569e"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(
        title="Width",
        description="Width of output image. Recommended 1024 or 1280",
        default=1024,
    )
    height: int = Field(
        title="Height",
        description="Height of output image. Recommended 1024 or 1280",
        default=1024,
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed",
    )
    scheduler: Scheduler = Field(description="scheduler", default="DPM++2MSDE")
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance. Recommended 4-6",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Input prompt",
        default="nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results.",
        ge=1.0,
        le=100.0,
        default=20,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
    )


class Width(int, Enum):
    _64 = 64
    _128 = 128
    _192 = 192
    _256 = 256
    _320 = 320
    _384 = 384
    _448 = 448
    _512 = 512
    _576 = 576
    _640 = 640
    _704 = 704
    _768 = 768
    _832 = 832
    _896 = 896
    _960 = 960
    _1024 = 1024


class Height(int, Enum):
    _64 = 64
    _128 = 128
    _192 = 192
    _256 = 256
    _320 = 320
    _384 = 384
    _448 = 448
    _512 = 512
    _576 = 576
    _640 = 640
    _704 = 704
    _768 = 768
    _832 = 832
    _896 = 896
    _960 = 960
    _1024 = 1024


class StableDiffusion(ReplicateNode):
    """A latent text-to-image diffusion model capable of generating photo-realistic images given any text input"""

    def replicate_model_id(self):
        return "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    width: Width = Field(
        description="Width of generated image in pixels. Needs to be a multiple of 64",
        default=768,
    )
    height: Height = Field(
        description="Height of generated image in pixels. Needs to be a multiple of 64",
        default=768,
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="a vision of paradise. unreal engine",
    )
    scheduler: Scheduler = Field(
        description="Choose a scheduler.", default="DPMSolverMultistep"
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to generate.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=20.0,
        default=7.5,
    )
    negative_prompt: str | None = Field(
        title="Negative Prompt",
        description="Specify things to not see in the output",
        default=None,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )


class ControlnetRealisticVision(ReplicateNode):
    """controlnet 1.1 lineart x realistic-vision-v2.0 (updated to v5)"""

    def replicate_model_id(self):
        return "usamaehsan/controlnet-1.1-x-realistic-vision-v2.0:51778c7522eb99added82c0c52873d7a391eecf5fcc3ac7856613b7e6443f2f7"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed", description="Leave blank to randomize", default=None
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    steps: int = Field(
        title="Steps", description=" num_inference_steps", ge=0.0, le=100.0, default=20
    )
    prompt: str = Field(
        title="Prompt",
        default="(a tabby cat)+++, high resolution, sitting on a park bench",
    )
    strength: float = Field(
        title="Strength",
        description="control strength/weight",
        ge=0.0,
        le=2.0,
        default=0.8,
    )
    max_width: float = Field(
        title="Max Width", description="max width of mask/image", ge=128.0, default=612
    )
    max_height: float = Field(
        title="Max Height",
        description="max height of mask/image",
        ge=128.0,
        default=612,
    )
    guidance_scale: int = Field(
        title="Guidance Scale",
        description="guidance_scale",
        ge=0.0,
        le=30.0,
        default=10,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        default="(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck",
    )


class Refine(str, Enum):
    NO_REFINER = "no_refiner"
    EXPERT_ENSEMBLE_REFINER = "expert_ensemble_refiner"
    BASE_IMAGE_REFINER = "base_image_refiner"


class StableDiffusionXL(ReplicateNode):
    """A text-to-image generative AI model that creates beautiful images"""

    def replicate_model_id(self):
        return "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(title="Width", description="Width of output image", default=1024)
    height: int = Field(
        title="Height", description="Height of output image", default=1024
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="An astronaut riding a rainbow unicorn",
    )
    refine: Refine = Field(
        description="Which refine style to use", default="no_refiner"
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    lora_scale: float = Field(
        title="Lora Scale",
        description="LoRA additive scale. Only applicable on trained models.",
        ge=0.0,
        le=1.0,
        default=0.6,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    refine_steps: int | None = Field(
        title="Refine Steps",
        description="For base_image_refiner, the number of steps to refine, defaults to num_inference_steps",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    high_noise_frac: float = Field(
        title="High Noise Frac",
        description="For expert_ensemble_refiner, the fraction of noise to use",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Input Negative Prompt", default=""
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    replicate_weights: str | None = Field(
        title="Replicate Weights",
        description="Replicate LoRA weights to use. Leave blank to use the default weights.",
        default=None,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
    )


class Juggernaut_XL_V9(ReplicateNode):
    """Juggernaut XL v9"""

    def replicate_model_id(self):
        return "lucataco/juggernaut-xl-v9:bea09cf018e513cef0841719559ea86d2299e05448633ac8fe270b5d5cd6777e"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    width: int = Field(title="Width", description="Width of output image", default=1024)
    height: int = Field(
        title="Height", description="Height of output image", default=1024
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="beautiful lady, (freckles), big smile, ruby eyes, short hair, dark makeup, hyperdetailed photography, soft light, head and shoulders portrait, cover",
    )
    scheduler: Scheduler = Field(description="scheduler", default="DPM++SDE")
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=20.0,
        default=2,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Input Negative Prompt",
        default="CGI, Unreal, Airbrushed, Digital",
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=100.0,
        default=5,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)",
        default=False,
    )


class SDXL_Pixar(ReplicateNode):
    """Create Pixar poster easily with SDXL Pixar."""

    def replicate_model_id(self):
        return "swartype/sdxl-pixar:81f8bbd3463056c8521eb528feb10509cc1385e2fabef590747f159848589048"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(title="Width", description="Width of output image", default=1024)
    height: int = Field(
        title="Height", description="Height of output image", default=1024
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="An astronaut riding a rainbow unicorn",
    )
    refine: Refine = Field(
        description="Which refine style to use", default="no_refiner"
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    lora_scale: float = Field(
        title="Lora Scale",
        description="LoRA additive scale. Only applicable on trained models.",
        ge=0.0,
        le=1.0,
        default=0.6,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    refine_steps: int | None = Field(
        title="Refine Steps",
        description="For base_image_refiner, the number of steps to refine, defaults to num_inference_steps",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    high_noise_frac: float = Field(
        title="High Noise Frac",
        description="For expert_ensemble_refiner, the fraction of noise to use",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Input Negative Prompt", default=""
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    replicate_weights: str | None = Field(
        title="Replicate Weights",
        description="Replicate LoRA weights to use. Leave blank to use the default weights.",
        default=None,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )


class SDXL_Emoji(ReplicateNode):
    """An SDXL fine-tune based on Apple Emojis"""

    def replicate_model_id(self):
        return "fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(title="Width", description="Width of output image", default=1024)
    height: int = Field(
        title="Height", description="Height of output image", default=1024
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="An astronaut riding a rainbow unicorn",
    )
    refine: Refine = Field(
        description="Which refine style to use", default="no_refiner"
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    lora_scale: float = Field(
        title="Lora Scale",
        description="LoRA additive scale. Only applicable on trained models.",
        ge=0.0,
        le=1.0,
        default=0.6,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    refine_steps: int | None = Field(
        title="Refine Steps",
        description="For base_image_refiner, the number of steps to refine, defaults to num_inference_steps",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    high_noise_frac: float = Field(
        title="High Noise Frac",
        description="For expert_ensemble_refiner, the fraction of noise to use",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Input Negative Prompt", default=""
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    replicate_weights: str | None = Field(
        title="Replicate Weights",
        description="Replicate LoRA weights to use. Leave blank to use the default weights.",
        default=None,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )


class StableDiffusionInpainting(ReplicateNode):
    """SDXL Inpainting developed by the HF Diffusers team"""

    def replicate_model_id(self):
        return "lucataco/sdxl-inpainting:a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: str | None = Field(
        title="Mask",
        description="Mask image - make sure it's the same size as the input image",
        default=None,
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    steps: int = Field(
        title="Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=80.0,
        default=20,
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="modern bed with beige sheet and pillows",
    )
    strength: float = Field(
        title="Strength",
        description="1.0 corresponds to full destruction of information in image",
        ge=0.01,
        le=1.0,
        default=0.7,
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output. Higher number of outputs may OOM.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale", description="Guidance scale", ge=0.0, le=10.0, default=8
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Input Negative Prompt",
        default="monochrome, lowres, bad anatomy, worst quality, low quality",
    )


class Controlnet_1(str, Enum):
    NONE = "none"
    EDGE_CANNY = "edge_canny"
    ILLUSION = "illusion"
    DEPTH_LERES = "depth_leres"
    DEPTH_MIDAS = "depth_midas"
    SOFT_EDGE_PIDI = "soft_edge_pidi"
    SOFT_EDGE_HED = "soft_edge_hed"
    LINEART = "lineart"
    LINEART_ANIME = "lineart_anime"
    OPENPOSE = "openpose"


class Controlnet_2(str, Enum):
    NONE = "none"
    EDGE_CANNY = "edge_canny"
    ILLUSION = "illusion"
    DEPTH_LERES = "depth_leres"
    DEPTH_MIDAS = "depth_midas"
    SOFT_EDGE_PIDI = "soft_edge_pidi"
    SOFT_EDGE_HED = "soft_edge_hed"
    LINEART = "lineart"
    LINEART_ANIME = "lineart_anime"
    OPENPOSE = "openpose"


class Controlnet_3(str, Enum):
    NONE = "none"
    EDGE_CANNY = "edge_canny"
    ILLUSION = "illusion"
    DEPTH_LERES = "depth_leres"
    DEPTH_MIDAS = "depth_midas"
    SOFT_EDGE_PIDI = "soft_edge_pidi"
    SOFT_EDGE_HED = "soft_edge_hed"
    LINEART = "lineart"
    LINEART_ANIME = "lineart_anime"
    OPENPOSE = "openpose"


class Sizing_strategy(str, Enum):
    WIDTH_HEIGHT = "width_height"
    INPUT_IMAGE = "input_image"
    CONTROLNET_1_IMAGE = "controlnet_1_image"
    CONTROLNET_2_IMAGE = "controlnet_2_image"
    CONTROLNET_3_IMAGE = "controlnet_3_image"
    MASK_IMAGE = "mask_image"


class RealVisXLV3(ReplicateNode):
    """RealVisXl V3 with multi-controlnet, lora loading, img2img, inpainting"""

    def replicate_model_id(self):
        return "fofr/realvisxl-v3-multi-controlnet-lora:90a4a3604cd637cb9f1a2bdae1cfa9ed869362ca028814cdce310a78e27daade"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(title="Width", description="Width of output image", default=768)
    height: int = Field(
        title="Height", description="Height of output image", default=768
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="An astronaut riding a rainbow unicorn",
    )
    refine: Refine = Field(
        description="Which refine style to use", default="no_refiner"
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    lora_scale: float = Field(
        title="Lora Scale",
        description="LoRA additive scale. Only applicable on trained models.",
        ge=0.0,
        le=1.0,
        default=0.6,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output",
        ge=1.0,
        le=4.0,
        default=1,
    )
    controlnet_1: Controlnet_1 = Field(description="Controlnet", default="none")
    controlnet_2: Controlnet_2 = Field(description="Controlnet", default="none")
    controlnet_3: Controlnet_3 = Field(description="Controlnet", default="none")
    lora_weights: str | None = Field(
        title="Lora Weights",
        description="Replicate LoRA weights to use. Leave blank to use the default weights.",
        default=None,
    )
    refine_steps: int | None = Field(
        title="Refine Steps",
        description="For base_image_refiner, the number of steps to refine, defaults to num_inference_steps",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=False,
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Negative Prompt", default=""
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    sizing_strategy: Sizing_strategy = Field(
        description="Decide how to resize images – use width/height, resize based on input image or control image",
        default="width_height",
    )
    controlnet_1_end: float = Field(
        title="Controlnet 1 End",
        description="When controlnet conditioning ends",
        ge=0.0,
        le=1.0,
        default=1,
    )
    controlnet_2_end: float = Field(
        title="Controlnet 2 End",
        description="When controlnet conditioning ends",
        ge=0.0,
        le=1.0,
        default=1,
    )
    controlnet_3_end: float = Field(
        title="Controlnet 3 End",
        description="When controlnet conditioning ends",
        ge=0.0,
        le=1.0,
        default=1,
    )
    controlnet_1_image: ImageRef = Field(
        default=ImageRef(), description="Input image for first controlnet"
    )
    controlnet_1_start: float = Field(
        title="Controlnet 1 Start",
        description="When controlnet conditioning starts",
        ge=0.0,
        le=1.0,
        default=0,
    )
    controlnet_2_image: ImageRef = Field(
        default=ImageRef(), description="Input image for second controlnet"
    )
    controlnet_2_start: float = Field(
        title="Controlnet 2 Start",
        description="When controlnet conditioning starts",
        ge=0.0,
        le=1.0,
        default=0,
    )
    controlnet_3_image: ImageRef = Field(
        default=ImageRef(), description="Input image for third controlnet"
    )
    controlnet_3_start: float = Field(
        title="Controlnet 3 Start",
        description="When controlnet conditioning starts",
        ge=0.0,
        le=1.0,
        default=0,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=30,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API.",
        default=False,
    )
    controlnet_1_conditioning_scale: float = Field(
        title="Controlnet 1 Conditioning Scale",
        description="How strong the controlnet conditioning is",
        ge=0.0,
        le=4.0,
        default=0.75,
    )
    controlnet_2_conditioning_scale: float = Field(
        title="Controlnet 2 Conditioning Scale",
        description="How strong the controlnet conditioning is",
        ge=0.0,
        le=4.0,
        default=0.75,
    )
    controlnet_3_conditioning_scale: float = Field(
        title="Controlnet 3 Conditioning Scale",
        description="How strong the controlnet conditioning is",
        ge=0.0,
        le=4.0,
        default=0.75,
    )


class SDXL_Controlnet(ReplicateNode):
    """SDXL ControlNet - Canny"""

    def replicate_model_id(self):
        return "lucataco/sdxl-controlnet:06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b"

    def get_hardware(self):
        return "Nvidia A40 GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int = Field(
        title="Seed",
        description="Random seed. Set to 0 to randomize the seed",
        default=0,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="aerial view, a futuristic research complex in a bright foggy jungle, hard lighting",
    )
    condition_scale: float = Field(
        title="Condition Scale",
        description="controlnet conditioning scale for generalization",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Input Negative Prompt",
        default="low quality, bad quality, sketches",
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )


class Img_size(str, Enum):
    _512__2048 = "512, 2048"
    _512__1984 = "512, 1984"
    _512__1920 = "512, 1920"
    _512__1856 = "512, 1856"
    _576__1792 = "576, 1792"
    _576__1728 = "576, 1728"
    _576__1664 = "576, 1664"
    _640__1600 = "640, 1600"
    _640__1536 = "640, 1536"
    _704__1472 = "704, 1472"
    _704__1408 = "704, 1408"
    _704__1344 = "704, 1344"
    _768__1344 = "768, 1344"
    _768__1280 = "768, 1280"
    _832__1216 = "832, 1216"
    _832__1152 = "832, 1152"
    _896__1152 = "896, 1152"
    _896__1088 = "896, 1088"
    _960__1088 = "960, 1088"
    _960__1024 = "960, 1024"
    _1024__1024 = "1024, 1024"
    _1024__960 = "1024, 960"
    _1088__960 = "1088, 960"
    _1088__896 = "1088, 896"
    _1152__896 = "1152, 896"
    _1152__832 = "1152, 832"
    _1216__832 = "1216, 832"
    _1280__768 = "1280, 768"
    _1344__768 = "1344, 768"
    _1408__704 = "1408, 704"
    _1472__704 = "1472, 704"
    _1536__640 = "1536, 640"
    _1600__640 = "1600, 640"
    _1664__576 = "1664, 576"
    _1728__576 = "1728, 576"
    _1792__576 = "1792, 576"
    _1856__512 = "1856, 512"
    _1920__512 = "1920, 512"
    _1984__512 = "1984, 512"
    _2048__512 = "2048, 512"


class Product_fill(str, Enum):
    ORIGINAL = "Original"
    _80 = "80"
    _70 = "70"
    _60 = "60"
    _50 = "50"
    _40 = "40"
    _30 = "30"
    _20 = "20"


class SDXL_Ad_Inpaint(ReplicateNode):
    """Product advertising image generator using SDXL"""

    def replicate_model_id(self):
        return "catacolabs/sdxl-ad-inpaint:9c0cb4c579c54432431d96c70924afcca18983de872e8a221777fb1416253359"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed", description="Empty or 0 for a random image", default=None
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Remove background from this image"
    )
    prompt: str | None = Field(
        title="Prompt",
        description="Describe the new setting for your product",
        default=None,
    )
    img_size: Img_size = Field(
        description="Possible SDXL image sizes", default="1024, 1024"
    )
    apply_img: bool = Field(
        title="Apply Img",
        description="Applies the original product image to the final result",
        default=True,
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    product_fill: Product_fill = Field(
        description="What percentage of the image width to fill with product",
        default="Original",
    )
    guidance_scale: float = Field(
        title="Guidance Scale", description="Guidance Scale", default=7.5
    )
    condition_scale: float = Field(
        title="Condition Scale",
        description="controlnet conditioning scale for generalization",
        ge=0.3,
        le=0.9,
        default=0.9,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Describe what you do not want in your setting",
        default="low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement",
    )
    num_refine_steps: int = Field(
        title="Num Refine Steps",
        description="Number of steps to refine",
        ge=0.0,
        le=40.0,
        default=10,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps", description="Inference Steps", default=40
    )


class Output_format(str, Enum):
    WEBP = "webp"
    JPEG = "jpeg"
    PNG = "png"


class Kandinsky(ReplicateNode):
    """multilingual text2image latent diffusion model"""

    def replicate_model_id(self):
        return "ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    width: Width = Field(
        description="Width of output image. Lower the setting if hits memory limits.",
        default=512,
    )
    height: Height = Field(
        description="Height of output image. Lower the setting if hits memory limits.",
        default=512,
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="A moss covered astronaut with a black background",
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    output_format: Output_format = Field(
        description="Output image format", default="webp"
    )
    negative_prompt: str | None = Field(
        title="Negative Prompt",
        description="Specify things to not see in the output",
        default=None,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=75,
    )
    num_inference_steps_prior: int = Field(
        title="Num Inference Steps Prior",
        description="Number of denoising steps for priors",
        ge=1.0,
        le=500.0,
        default=25,
    )


class StableDiffusionXLLightning(ReplicateNode):
    """SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps"""

    def replicate_model_id(self):
        return "bytedance/sdxl-lightning-4step:727e49a643e999d602a896c774a0658ffefea21465756a6ce24b7ea4165eba6a"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    width: int = Field(
        title="Width",
        description="Width of output image. Recommended 1024 or 1280",
        default=1024,
    )
    height: int = Field(
        title="Height",
        description="Height of output image. Recommended 1024 or 1280",
        default=1024,
    )
    prompt: str = Field(
        title="Prompt", description="Input prompt", default="A superhero smiling"
    )
    scheduler: Scheduler = Field(description="scheduler", default="K_EULER")
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance. Recommended 7-8",
        ge=0.0,
        le=50.0,
        default=0,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Input prompt",
        default="worst quality, low quality",
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps. 4 for best results",
        ge=1.0,
        le=10.0,
        default=4,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images",
        default=False,
    )


class PlaygroundV2(ReplicateNode):
    """Playground v2.5 is the state-of-the-art open-source model in aesthetic quality"""

    def replicate_model_id(self):
        return "playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: str | None = Field(
        title="Mask",
        description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
        default=None,
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode"
    )
    width: int = Field(
        title="Width",
        description="Width of output image",
        ge=256.0,
        le=1536.0,
        default=1024,
    )
    height: int = Field(
        title="Height",
        description="Height of output image",
        ge=256.0,
        le=1536.0,
        default=1024,
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="Astronaut in a jungle, cold color palette, muted colors, detailed, 8k",
    )
    scheduler: Scheduler = Field(
        description="Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases",
        default="DPMSolver++",
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output.",
        ge=1.0,
        le=4.0,
        default=1,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=0.1,
        le=20.0,
        default=3,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Input prompt",
        default="ugly, deformed, noisy, blurry, distorted",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=60.0,
        default=25,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
    )


class Illusions(ReplicateNode):
    """Create illusions with img2img and masking support"""

    def replicate_model_id(self):
        return "fofr/illusions:579b32db82b24584c3c6155fe3ae12e8fce50ba28b575c23e8a1f5f3a5e99ed8"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(title="Seed", default=None)
    image: ImageRef = Field(default=ImageRef(), description="Optional img2img")
    width: int = Field(title="Width", default=768)
    height: int = Field(title="Height", default=768)
    prompt: str = Field(title="Prompt", default="a painting of a 19th century town")
    mask_image: ImageRef = Field(
        default=ImageRef(), description="Optional mask for inpainting"
    )
    num_outputs: int = Field(
        title="Num Outputs", description="Number of outputs", default=1
    )
    control_image: ImageRef = Field(default=ImageRef(), description="Control image")
    controlnet_end: float = Field(
        title="Controlnet End",
        description="When controlnet conditioning ends",
        default=1.0,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        default=7.5,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="The negative prompt to guide image generation.",
        default="ugly, disfigured, low quality, blurry, nsfw",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
        default=0.8,
    )
    sizing_strategy: Sizing_strategy = Field(
        description="Decide how to resize images – use width/height, resize based on input image or control image",
        default="width/height",
    )
    controlnet_start: float = Field(
        title="Controlnet Start",
        description="When controlnet conditioning starts",
        default=0.0,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps", description="Number of diffusion steps", default=40
    )
    controlnet_conditioning_scale: float = Field(
        title="Controlnet Conditioning Scale",
        description="How strong the controlnet conditioning is",
        default=0.75,
    )
