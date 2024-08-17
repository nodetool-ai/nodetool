from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class AdInpaint(ReplicateNode):
    """Product advertising image generator"""

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

    @classmethod
    def replicate_model_id(cls):
        return "logerzhu/ad-inpaint:b1c17d148455c1fda435ababe9ab1e03bc0d917cc3cf4251916f22c45c83c7df"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/3ZmtvTJWj3a0Al9XR7SSKqpAfLTZtrkM7t5KjLvz7Nqsv3pIA/ad_inpaint_3.jpg",
            "created_at": "2023-04-03T11:25:28.290524Z",
            "description": "Product advertising image generator",
            "github_url": None,
            "license_url": None,
            "name": "ad-inpaint",
            "owner": "logerzhu",
            "paper_url": None,
            "run_count": 382841,
            "url": "https://replicate.com/logerzhu/ad-inpaint",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    pixel: Pixel = Field(description="image total pixel", default=Pixel("512 * 512"))
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
        description="Max product size", default=Product_size("Original")
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


class ConsistentCharacter(ReplicateNode):
    """Create images of a given character in different poses"""

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/consistent-character:9c77a3c2f884193fcee4d89645f02a0b9def9434f9e03cb98460456b831c8772"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/0PQLx9Zz5fQkb6ZQmldEB2ElI9e61eYCeqWiaZSbCzUIqgnLB/ComfyUI_00005_.webp",
            "created_at": "2024-05-30T16:48:52.345721Z",
            "description": "Create images of a given character in different poses",
            "github_url": "https://github.com/fofr/cog-consistent-character",
            "license_url": "https://github.com/fofr/cog-consistent-character/blob/main/LICENSE",
            "name": "consistent-character",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 30200,
            "url": "https://replicate.com/fofr/consistent-character",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    prompt: str = Field(
        title="Prompt",
        description="Describe the subject. Include clothes and hairstyle for more consistency.",
        default="A headshot photo",
    )
    subject: ImageRef = Field(
        default=ImageRef(),
        description="An image of a person. Best images are square close ups of a face, but they do not have to be.",
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.",
        ge=0.0,
        le=100.0,
        default=80,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want to see in your image",
        default="",
    )
    randomise_poses: bool = Field(
        title="Randomise Poses", description="Randomise the poses used.", default=True
    )
    number_of_outputs: int = Field(
        title="Number Of Outputs",
        description="The number of images to generate.",
        ge=1.0,
        le=20.0,
        default=3,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images.",
        default=False,
    )
    number_of_images_per_pose: int = Field(
        title="Number Of Images Per Pose",
        description="The number of images to generate for each pose.",
        ge=1.0,
        le=4.0,
        default=1,
    )


class PulidBase(ReplicateNode):
    """Use a face to make images. Uses SDXL fine-tuned checkpoints."""

    class Face_style(str, Enum):
        HIGH_FIDELITY = "high-fidelity"
        STYLIZED = "stylized"

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    class Checkpoint_model(str, Enum):
        GENERAL___ALBEDOBASEXL_V21 = "general - albedobaseXL_v21"
        GENERAL___DREAMSHAPERXL_ALPHA2XL10 = "general - dreamshaperXL_alpha2Xl10"
        ANIMATED___STARLIGHTXLANIMATED_V3 = "animated - starlightXLAnimated_v3"
        ANIMATED___PIXLANIMECARTOONCOMIC_V10 = "animated - pixlAnimeCartoonComic_v10"
        REALISTIC___RUNDIFFUSIONXL_BETA = "realistic - rundiffusionXL_beta"
        REALISTIC___REALVISXL_V4_0 = "realistic - RealVisXL_V4.0"
        REALISTIC___SDXLUNSTABLEDIFFUSERS_NIHILMANIA = (
            "realistic - sdxlUnstableDiffusers_nihilmania"
        )
        CINEMATIC___CINEMATICREDMOND = "cinematic - CinematicRedmond"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/pulid-base:65ea75658bf120abbbdacab07e89e78a74a6a1b1f504349f4c4e3b01a655ee7a"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/2b168822-4407-4d18-9b58-29068d501c92/pulid-base-cover.webp",
            "created_at": "2024-05-09T13:48:08.359715Z",
            "description": "Use a face to make images. Uses SDXL fine-tuned checkpoints.",
            "github_url": "https://github.com/fofr/cog-comfyui-pulid/tree/pulid-base",
            "license_url": None,
            "name": "pulid-base",
            "owner": "fofr",
            "paper_url": "https://arxiv.org/abs/2404.16022",
            "run_count": 40995,
            "url": "https://replicate.com/fofr/pulid-base",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    width: int = Field(
        title="Width",
        description="Width of the output image (ignored if structure image given)",
        default=1024,
    )
    height: int = Field(
        title="Height",
        description="Height of the output image (ignored if structure image given)",
        default=1024,
    )
    prompt: str = Field(
        title="Prompt",
        description="You might need to include a gender in the prompt to get the desired result",
        default="A photo of a person",
    )
    face_image: ImageRef = Field(
        default=ImageRef(), description="The face image to use for the generation"
    )
    face_style: Face_style = Field(
        description="Style of the face", default=Face_style("high-fidelity")
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.",
        ge=0.0,
        le=100.0,
        default=80,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want to see in your image",
        default="",
    )
    checkpoint_model: Checkpoint_model = Field(
        description="Model to use for the generation",
        default=Checkpoint_model("general - dreamshaperXL_alpha2Xl10"),
    )
    number_of_images: int = Field(
        title="Number Of Images",
        description="Number of images to generate",
        ge=1.0,
        le=10.0,
        default=1,
    )


class SDXL_Pixar(ReplicateNode):
    """Create Pixar poster easily with SDXL Pixar."""

    class Refine(str, Enum):
        NO_REFINER = "no_refiner"
        EXPERT_ENSEMBLE_REFINER = "expert_ensemble_refiner"
        BASE_IMAGE_REFINER = "base_image_refiner"

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"

    @classmethod
    def replicate_model_id(cls):
        return "swartype/sdxl-pixar:81f8bbd3463056c8521eb528feb10509cc1385e2fabef590747f159848589048"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/68125b17-60d7-4949-8984-0d50d736a623/out-0_5.png",
            "created_at": "2023-10-21T10:32:49.911227Z",
            "description": "Create Pixar poster easily with SDXL Pixar.",
            "github_url": None,
            "license_url": None,
            "name": "sdxl-pixar",
            "owner": "swartype",
            "paper_url": None,
            "run_count": 521967,
            "url": "https://replicate.com/swartype/sdxl-pixar",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

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
        description="Which refine style to use", default=Refine("no_refiner")
    )
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("K_EULER"))
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
        default=20,
    )


class SDXL_Emoji(ReplicateNode):
    """An SDXL fine-tune based on Apple Emojis"""

    class Refine(str, Enum):
        NO_REFINER = "no_refiner"
        EXPERT_ENSEMBLE_REFINER = "expert_ensemble_refiner"
        BASE_IMAGE_REFINER = "base_image_refiner"

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/a3z81v5vwlKfLq1H5uBqpVmkHalOVup0jSLma9E2UaF3tawIA/out-0.png",
            "created_at": "2023-09-04T09:18:11.028708Z",
            "description": "An SDXL fine-tune based on Apple Emojis",
            "github_url": None,
            "license_url": None,
            "name": "sdxl-emoji",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 4711188,
            "url": "https://replicate.com/fofr/sdxl-emoji",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

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
        description="Which refine style to use", default=Refine("no_refiner")
    )
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("K_EULER"))
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
        default=20,
    )


class SDXL_Ad_Inpaint(ReplicateNode):
    """Product advertising image generator using SDXL"""

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

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"

    class Product_fill(str, Enum):
        ORIGINAL = "Original"
        _80 = "80"
        _70 = "70"
        _60 = "60"
        _50 = "50"
        _40 = "40"
        _30 = "30"
        _20 = "20"

    @classmethod
    def replicate_model_id(cls):
        return "catacolabs/sdxl-ad-inpaint:9c0cb4c579c54432431d96c70924afcca18983de872e8a221777fb1416253359"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://pbxt.replicate.delivery/ORbuWtoy0y6NI9f4DrJ2fxs92LgviBaOlzOVdYTr3pT8eKJjA/7-out.png",
            "created_at": "2023-09-15T15:37:19.970710Z",
            "description": "Product advertising image generator using SDXL",
            "github_url": "https://github.com/CatacoLabs/cog-sdxl-ad-inpaint",
            "license_url": "https://github.com/huggingface/hfapi/blob/master/LICENSE",
            "name": "sdxl-ad-inpaint",
            "owner": "catacolabs",
            "paper_url": None,
            "run_count": 215722,
            "url": "https://replicate.com/catacolabs/sdxl-ad-inpaint",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

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
        description="Possible SDXL image sizes", default=Img_size("1024, 1024")
    )
    apply_img: bool = Field(
        title="Apply Img",
        description="Applies the original product image to the final result",
        default=True,
    )
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("K_EULER"))
    product_fill: Product_fill = Field(
        description="What percentage of the image width to fill with product",
        default=Product_fill("Original"),
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
        title="Num Inference Steps", description="Inference Steps", default=20
    )


class Illusions(ReplicateNode):
    """Create illusions with img2img and masking support"""

    class Sizing_strategy(str, Enum):
        WIDTH_HEIGHT = "width/height"
        INPUT_IMAGE = "input_image"
        CONTROL_IMAGE = "control_image"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/illusions:579b32db82b24584c3c6155fe3ae12e8fce50ba28b575c23e8a1f5f3a5e99ed8"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/0mvORZpRyI4yH5wKdpHDtgqWqUGpsO5w0EcElf7g90eYXF1RA/output-0.png",
            "created_at": "2023-11-03T17:24:31.993569Z",
            "description": "Create illusions with img2img and masking support",
            "github_url": "https://github.com/fofr/cog-illusion",
            "license_url": None,
            "name": "illusions",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 7244,
            "url": "https://replicate.com/fofr/illusions",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

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
        default=Sizing_strategy("width/height"),
    )
    controlnet_start: float = Field(
        title="Controlnet Start",
        description="When controlnet conditioning starts",
        default=0.0,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps", description="Number of diffusion steps", default=20
    )
    controlnet_conditioning_scale: float = Field(
        title="Controlnet Conditioning Scale",
        description="How strong the controlnet conditioning is",
        default=0.75,
    )
