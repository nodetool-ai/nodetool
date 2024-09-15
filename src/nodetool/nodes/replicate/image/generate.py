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
        return "None"

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
            "run_count": 436386,
            "url": "https://replicate.com/logerzhu/ad-inpaint",
            "visibility": "public",
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
        return "None"

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
            "run_count": 359398,
            "url": "https://replicate.com/fofr/consistent-character",
            "visibility": "public",
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
        return "None"

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
            "run_count": 110629,
            "url": "https://replicate.com/fofr/pulid-base",
            "visibility": "public",
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


class StableDiffusion(ReplicateNode):
    """A latent text-to-image diffusion model capable of generating photo-realistic images given any text input"""

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

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        K_EULER = "K_EULER"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        PNDM = "PNDM"
        KLMS = "KLMS"

    @classmethod
    def replicate_model_id(cls):
        return "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/sWeZFZou6v3CPKuoJbqX46ugPaHT1DcsWYx0srPmGrMOCPYIA/out-0.png",
            "created_at": "2022-08-22T21:37:08.396208Z",
            "description": "A latent text-to-image diffusion model capable of generating photo-realistic images given any text input",
            "github_url": "https://github.com/replicate/cog-stable-diffusion",
            "license_url": "https://huggingface.co/spaces/CompVis/stable-diffusion-license",
            "name": "stable-diffusion",
            "owner": "stability-ai",
            "paper_url": "https://arxiv.org/abs/2112.10752",
            "run_count": 108883165,
            "url": "https://replicate.com/stability-ai/stable-diffusion",
            "visibility": "public",
        }

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
        default=Width(768),
    )
    height: Height = Field(
        description="Height of generated image in pixels. Needs to be a multiple of 64",
        default=Height(768),
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="a vision of paradise. unreal engine",
    )
    scheduler: Scheduler = Field(
        description="Choose a scheduler.", default=Scheduler("DPMSolverMultistep")
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


class StableDiffusionXL(ReplicateNode):
    """A text-to-image generative AI model that creates beautiful images"""

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

    class Lr_scheduler(str, Enum):
        CONSTANT = "constant"
        LINEAR = "linear"

    class Input_images_filetype(str, Enum):
        ZIP = "zip"
        TAR = "tar"
        INFER = "infer"

    @classmethod
    def replicate_model_id(cls):
        return "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/61004930-fb88-4e09-9bd4-74fd8b4aa677/sdxl_cover.png",
            "created_at": "2023-07-26T17:53:09.882651Z",
            "description": "A text-to-image generative AI model that creates beautiful images",
            "github_url": "https://github.com/replicate/cog-sdxl",
            "license_url": "https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SDXL1.0",
            "name": "sdxl",
            "owner": "stability-ai",
            "paper_url": "https://arxiv.org/abs/2307.01952",
            "run_count": 64650445,
            "url": "https://replicate.com/stability-ai/sdxl",
            "visibility": "public",
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
        default=50,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)",
        default=False,
    )


class SD3_Explorer(ReplicateNode):
    """A model for experimenting with all the SD3 settings. Non-commercial use only, unless you have a Stability AI Self Hosted License."""

    class Model(str, Enum):
        SD3_MEDIUM_INCL_CLIPS_SAFETENSORS = "sd3_medium_incl_clips.safetensors"
        SD3_MEDIUM_INCL_CLIPS_T5XXLFP16_SAFETENSORS = (
            "sd3_medium_incl_clips_t5xxlfp16.safetensors"
        )
        SD3_MEDIUM_INCL_CLIPS_T5XXLFP8_SAFETENSORS = (
            "sd3_medium_incl_clips_t5xxlfp8.safetensors"
        )

    class Sampler(str, Enum):
        EULER = "euler"
        EULER_ANCESTRAL = "euler_ancestral"
        HEUN = "heun"
        HEUNPP2 = "heunpp2"
        DPM_2 = "dpm_2"
        DPM_2_ANCESTRAL = "dpm_2_ancestral"
        LMS = "lms"
        DPM_FAST = "dpm_fast"
        DPM_ADAPTIVE = "dpm_adaptive"
        DPMPP_2S_ANCESTRAL = "dpmpp_2s_ancestral"
        DPMPP_SDE = "dpmpp_sde"
        DPMPP_SDE_GPU = "dpmpp_sde_gpu"
        DPMPP_2M = "dpmpp_2m"
        DPMPP_2M_SDE = "dpmpp_2m_sde"
        DPMPP_2M_SDE_GPU = "dpmpp_2m_sde_gpu"
        DPMPP_3M_SDE = "dpmpp_3m_sde"
        DPMPP_3M_SDE_GPU = "dpmpp_3m_sde_gpu"
        DDPM = "ddpm"
        LCM = "lcm"
        DDIM = "ddim"
        UNI_PC = "uni_pc"
        UNI_PC_BH2 = "uni_pc_bh2"

    class Scheduler(str, Enum):
        NORMAL = "normal"
        KARRAS = "karras"
        EXPONENTIAL = "exponential"
        SGM_UNIFORM = "sgm_uniform"
        SIMPLE = "simple"
        DDIM_UNIFORM = "ddim_uniform"

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/sd3-explorer:a9f4aebd943ad7db13de8e34debea359d5578d08f128e968f9a36c3e9b0148d4"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/BnkJxF51oYZsBdGsgn6vGIkeQUO17GgTPloJCuM0LpQNR5fSA/SD3_00001_.webp",
            "created_at": "2024-06-18T11:17:24.775662Z",
            "description": "A model for experimenting with all the SD3 settings. Non-commercial use only, unless you have a Stability AI Self Hosted License.",
            "github_url": "https://github.com/fofr/cog-comfyui-sd3-explorer",
            "license_url": "https://huggingface.co/stabilityai/stable-diffusion-3-medium",
            "name": "sd3-explorer",
            "owner": "fofr",
            "paper_url": "https://arxiv.org/pdf/2403.03206",
            "run_count": 30622,
            "url": "https://replicate.com/fofr/sd3-explorer",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    model: Model = Field(
        description="Pick whether to use T5-XXL in fp16, fp8 or not at all. We recommend fp16 for this model as it has the best image quality. When running locally we recommend fp8 for lower memory usage. We've included all versions here for exploration.",
        default=Model("sd3_medium_incl_clips_t5xxlfp16.safetensors"),
    )
    shift: float = Field(
        title="Shift",
        description="The timestep scheduling shift; shift values higher than 1.0 are better at managing noise in higher resolutions. Try values 6.0 and 2.0 to experiment with effects.",
        ge=0.0,
        le=20.0,
        default=3,
    )
    steps: int = Field(
        title="Steps",
        description="The number of steps to run the model for (more steps = better image but slower generation. Best results for this model are around 26 to 36 steps.)",
        default=28,
    )
    width: int = Field(
        title="Width",
        description="The width of the image (best output at ~1 megapixel. Resolution must be divisible by 64)",
        default=1024,
    )
    height: int = Field(
        title="Height",
        description="The height of the image (best output at ~1 megapixel. Resolution must be divisible by 64)",
        default=1024,
    )
    prompt: str = Field(
        title="Prompt",
        description="This prompt is ignored when using the triple prompt mode. See below.",
        default="",
    )
    sampler: Sampler = Field(
        description="The sampler to use (used to manage noise)",
        default=Sampler("dpmpp_2m"),
    )
    scheduler: Scheduler = Field(
        description="The scheduler to use (used to manage noise; do not use karras)",
        default=Scheduler("sgm_uniform"),
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="The guidance scale tells the model how similar the output should be to the prompt. (Recommend between 3.5 and 4.5; if images look 'burnt,' lower the value.)",
        ge=0.0,
        le=20.0,
        default=3.5,
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
        description="Negative prompts do not really work in SD3. This will simply cause your output image to vary in unpredictable ways.",
        default="",
    )
    number_of_images: int = Field(
        title="Number Of Images",
        description="The number of images to generate",
        ge=1.0,
        le=10.0,
        default=1,
    )
    triple_prompt_t5: str = Field(
        title="Triple Prompt T5",
        description="The prompt that will be passed to just the T5-XXL model.",
        default="",
    )
    use_triple_prompt: bool = Field(title="Use Triple Prompt", default=False)
    triple_prompt_clip_g: str = Field(
        title="Triple Prompt Clip G",
        description="The prompt that will be passed to just the CLIP-G model.",
        default="",
    )
    triple_prompt_clip_l: str = Field(
        title="Triple Prompt Clip L",
        description="The prompt that will be passed to just the CLIP-L model.",
        default="",
    )
    negative_conditioning_end: float = Field(
        title="Negative Conditioning End",
        description="When the negative conditioning should stop being applied. By default it is disabled. If you want to try a negative prompt, start with a value of 0.1",
        ge=0.0,
        le=1.0,
        default=0,
    )
    triple_prompt_empty_padding: bool = Field(
        title="Triple Prompt Empty Padding",
        description="Whether to add padding for empty prompts. Useful if you only want to pass a prompt to one or two of the three text encoders. Has no effect when all prompts are filled. Disable this for interesting effects.",
        default=True,
    )


class Juggernaut_XL_V9(ReplicateNode):
    """Juggernaut XL v9"""

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"
        DPM__SDE = "DPM++SDE"

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/juggernaut-xl-v9:bea09cf018e513cef0841719559ea86d2299e05448633ac8fe270b5d5cd6777e"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/I2fZYRjmiKVpWCVhi9guAaUpXrZeLfM28fkjr7NYQyh5DVtJB/out-0.png",
            "created_at": "2024-02-28T21:01:49.723331Z",
            "description": "Juggernaut XL v9",
            "github_url": "https://github.com/lucataco/cog-juggernaut-xl-v9",
            "license_url": "https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SDXL1.0",
            "name": "juggernaut-xl-v9",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 1010193,
            "url": "https://replicate.com/lucataco/juggernaut-xl-v9",
            "visibility": "public",
        }

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
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("DPM++SDE"))
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


class EpicRealismXL_Lightning_Hades(ReplicateNode):
    """Fast and high quality lightning model, epiCRealismXL-Lightning Hades"""

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/epicrealismxl-lightning-hades:0ca10b1fd361c1c5568720736411eaa89d9684415eb61fd36875b4d3c20f605a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/ulYZRIyAUDYpOZfl7OjhrKxxzZhSjddNP1hguuZxyq6yDndJA/R8__00001_.webp",
            "created_at": "2024-06-04T12:09:51.123632Z",
            "description": "Fast and high quality lightning model, epiCRealismXL-Lightning Hades",
            "github_url": None,
            "license_url": "https://civitai.com/models/354130/epicrealismxl-lightning",
            "name": "epicrealismxl-lightning-hades",
            "owner": "fofr",
            "paper_url": "https://civitai.com/models/354130/epicrealismxl-lightning",
            "run_count": 86078,
            "url": "https://replicate.com/fofr/epicrealismxl-lightning-hades",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    width: int = Field(title="Width", default=1024)
    height: int = Field(title="Height", default=1024)
    prompt: str = Field(title="Prompt", default="")
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
    number_of_images: int = Field(
        title="Number Of Images",
        description="Number of images to generate",
        ge=1.0,
        le=10.0,
        default=1,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images.",
        default=False,
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
        return "None"

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
            "run_count": 570860,
            "url": "https://replicate.com/swartype/sdxl-pixar",
            "visibility": "public",
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
        default=50,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
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
        return "None"

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
            "run_count": 5622600,
            "url": "https://replicate.com/fofr/sdxl-emoji",
            "visibility": "public",
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
        default=50,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
    )


class StableDiffusionInpainting(ReplicateNode):
    """SDXL Inpainting developed by the HF Diffusers team"""

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/sdxl-inpainting:a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/5uUmO34KUZKsAJkcc82gC17WZdJgrbtRpRebyLYo9EJGHqOJA/out-0.png",
            "created_at": "2023-10-17T03:53:36.563598Z",
            "description": "SDXL Inpainting developed by the HF Diffusers team",
            "github_url": "https://github.com/lucataco/cog-sdxl-inpainting",
            "license_url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md",
            "name": "sdxl-inpainting",
            "owner": "lucataco",
            "paper_url": "https://huggingface.co/papers/2112.10752",
            "run_count": 675808,
            "url": "https://replicate.com/lucataco/sdxl-inpainting",
            "visibility": "public",
        }

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
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("K_EULER"))
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


class StableDiffusionInpainting(ReplicateNode):
    """Fill in masked parts of images with Stable Diffusion"""

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

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        K_EULER = "K_EULER"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        PNDM = "PNDM"
        KLMS = "KLMS"

    @classmethod
    def replicate_model_id(cls):
        return "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/xs0pPOUM6HKmPlJJBXqKfE1YsiMzgNsCuGedlX0VqvPYifLgA/out-0.png",
            "created_at": "2022-12-02T17:40:01.152489Z",
            "description": "Fill in masked parts of images with Stable Diffusion",
            "github_url": "https://github.com/replicate/cog-stable-diffusion-inpainting",
            "license_url": "https://huggingface.co/stabilityai/stable-diffusion-2/blob/main/LICENSE-MODEL",
            "name": "stable-diffusion-inpainting",
            "owner": "stability-ai",
            "paper_url": None,
            "run_count": 18107333,
            "url": "https://replicate.com/stability-ai/stable-diffusion-inpainting",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: ImageRef = Field(
        default=ImageRef(),
        description="Black and white image to use as mask for inpainting over the image provided. White pixels are inpainted and black pixels are preserved.",
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="Initial image to generate variations of. Will be resized to height x width",
    )
    width: Width = Field(
        description="Width of generated image in pixels. Needs to be a multiple of 64",
        default=Width(512),
    )
    height: Height = Field(
        description="Height of generated image in pixels. Needs to be a multiple of 64",
        default=Height(512),
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="a vision of paradise. unreal engine",
    )
    scheduler: Scheduler = Field(
        description="Choose a scheduler.", default=Scheduler("DPMSolverMultistep")
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
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)",
        default=False,
    )


class Kandinsky_2_2(ReplicateNode):
    """multilingual text2image latent diffusion model"""

    class Width(int, Enum):
        _384 = 384
        _512 = 512
        _576 = 576
        _640 = 640
        _704 = 704
        _768 = 768
        _960 = 960
        _1024 = 1024
        _1152 = 1152
        _1280 = 1280
        _1536 = 1536
        _1792 = 1792
        _2048 = 2048

    class Height(int, Enum):
        _384 = 384
        _512 = 512
        _576 = 576
        _640 = 640
        _704 = 704
        _768 = 768
        _960 = 960
        _1024 = 1024
        _1152 = 1152
        _1280 = 1280
        _1536 = 1536
        _1792 = 1792
        _2048 = 2048

    class Output_format(str, Enum):
        WEBP = "webp"
        JPEG = "jpeg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/Lca3IEjcKoJBBVS6ajROkK37sDzPsmjYxIcFzxPZp65wZzTE/out-0.png",
            "created_at": "2023-07-12T21:53:29.439515Z",
            "description": "multilingual text2image latent diffusion model",
            "github_url": "https://github.com/chenxwh/Kandinsky-2/tree/v2.2",
            "license_url": "https://github.com/ai-forever/Kandinsky-2/blob/main/license",
            "name": "kandinsky-2.2",
            "owner": "ai-forever",
            "paper_url": None,
            "run_count": 9992781,
            "url": "https://replicate.com/ai-forever/kandinsky-2.2",
            "visibility": "public",
        }

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
        default=Width(512),
    )
    height: Height = Field(
        description="Height of output image. Lower the setting if hits memory limits.",
        default=Height(512),
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
        description="Output image format", default=Output_format("webp")
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


class RealVisXL_V2(ReplicateNode):
    """Implementation of SDXL RealVisXL_V2.0"""

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
        return "lucataco/realvisxl-v2.0:7d6a2f9c4754477b12c14ed2a58f89bb85128edcdd581d24ce58b6926029de08"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/eCTbwmWQ00UbQiZdRMfgLhTRIKFUkBPei9fOQ2taGKw3NpaHB/out-0.png",
            "created_at": "2023-11-01T15:03:35.114225Z",
            "description": "Implementation of SDXL RealVisXL_V2.0",
            "github_url": "https://github.com/lucataco/cog-realvisxl-v2.0",
            "license_url": "https://huggingface.co/models?license=license%3Aopenrail%2B%2B",
            "name": "realvisxl-v2.0",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 278011,
            "url": "https://replicate.com/lucataco/realvisxl-v2.0",
            "visibility": "public",
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
        default="dark shot, front shot, closeup photo of a 25 y.o latino man, perfect eyes, natural skin, skin moles, looks at viewer, cinematic shot",
    )
    scheduler: Scheduler = Field(
        description="scheduler", default=Scheduler("DPMSolverMultistep")
    )
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
    lora_weights: str | None = Field(
        title="Lora Weights",
        description="Replicate LoRA weights to use. Leave blank to use the default weights.",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7,
    )
    apply_watermark: bool = Field(
        title="Apply Watermark",
        description="Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.",
        default=True,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Input prompt",
        default="(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth",
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
        le=500.0,
        default=40,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety",
        default=False,
    )


class Flux_Schnell(ReplicateNode):
    """The fastest image generation model tailored for local development and personal use"""

    class Aspect_ratio(str, Enum):
        _1_1 = "1:1"
        _16_9 = "16:9"
        _21_9 = "21:9"
        _2_3 = "2:3"
        _3_2 = "3:2"
        _4_5 = "4:5"
        _5_4 = "5:4"
        _9_16 = "9:16"
        _9_21 = "9:21"

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "black-forest-labs/flux-schnell:f2ab8a5bfe79f02f0789a146cf5e73d2a4ff2684a98c2b303d1e1ff3814271db"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/1f550ddf-344a-481b-aa2b-8f662983f7d4/Replicate_Prediction_14.webp",
            "created_at": "2024-07-30T00:32:11.473557Z",
            "description": "The fastest image generation model tailored for local development and personal use",
            "github_url": "https://github.com/replicate/cog-flux-schnell",
            "license_url": "https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-schnell",
            "name": "flux-schnell",
            "owner": "black-forest-labs",
            "paper_url": None,
            "run_count": 35014472,
            "url": "https://replicate.com/black-forest-labs/flux-schnell",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Set for reproducible generation",
        default=None,
    )
    prompt: str | None = Field(
        title="Prompt", description="Prompt for generated image", default=None
    )
    guidance: float = Field(
        title="Guidance",
        description="Guidance for generated image. Ignored for flux-schnell",
        ge=0.0,
        le=10.0,
        default=3.5,
    )
    aspect_ratio: Aspect_ratio = Field(
        description="Aspect ratio for the generated image", default=Aspect_ratio("1:1")
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs",
        ge=0.0,
        le=100.0,
        default=80,
    )


class Flux_Dev(ReplicateNode):
    """A 12 billion parameter rectified flow transformer capable of generating images from text descriptions"""

    class Aspect_ratio(str, Enum):
        _1_1 = "1:1"
        _16_9 = "16:9"
        _21_9 = "21:9"
        _2_3 = "2:3"
        _3_2 = "3:2"
        _4_5 = "4:5"
        _5_4 = "5:4"
        _9_16 = "9:16"
        _9_21 = "9:21"

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "black-forest-labs/flux-dev:93d72f81bd019dde2bfcba9585a6f74e600b13a43a96eb01a42da54f5ab4df6a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/4c0ff159-ab97-4962-acdf-a0f422694a81/Replicate_Prediction_15.webp",
            "created_at": "2024-07-29T23:25:06.100855Z",
            "description": "A 12 billion parameter rectified flow transformer capable of generating images from text descriptions",
            "github_url": "https://github.com/black-forest-labs/flux",
            "license_url": "https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev",
            "name": "flux-dev",
            "owner": "black-forest-labs",
            "paper_url": None,
            "run_count": 1483141,
            "url": "https://replicate.com/black-forest-labs/flux-dev",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Set for reproducible generation",
        default=None,
    )
    image: str | None = Field(
        title="Image",
        description="Input image for image to image mode. The aspect ratio of your output will match this image",
        default=None,
    )
    prompt: str | None = Field(
        title="Prompt", description="Prompt for generated image", default=None
    )
    guidance: float = Field(
        title="Guidance",
        description="Guidance for generated image. Ignored for flux-schnell",
        ge=0.0,
        le=10.0,
        default=3.5,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of outputs to generate",
        ge=1.0,
        le=4.0,
        default=1,
    )
    aspect_ratio: Aspect_ratio = Field(
        description="Aspect ratio for the generated image", default=Aspect_ratio("1:1")
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs",
        ge=0.0,
        le=100.0,
        default=80,
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps. Recommended range is 28-50",
        ge=1.0,
        le=50.0,
        default=50,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)",
        default=False,
    )


class Flux_Pro(ReplicateNode):
    """State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity."""

    class Aspect_ratio(str, Enum):
        _1_1 = "1:1"
        _16_9 = "16:9"
        _2_3 = "2:3"
        _3_2 = "3:2"
        _4_5 = "4:5"
        _5_4 = "5:4"
        _9_16 = "9:16"

    @classmethod
    def replicate_model_id(cls):
        return "black-forest-labs/flux-pro:caf8d6bf110808c53bb90767ea81e1bbd0f0690ba37a4a24b27b17e2f9a5c011"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/ae5d9d40-31f5-4c33-bd66-2f22b0e8d459/Flux_Pro_Sample.jpg",
            "created_at": "2024-08-01T09:32:10.863297Z",
            "description": "State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity.",
            "github_url": None,
            "license_url": "https://replicate.com/black-forest-labs/flux-pro#license",
            "name": "flux-pro",
            "owner": "black-forest-labs",
            "paper_url": None,
            "run_count": 3092040,
            "url": "https://replicate.com/black-forest-labs/flux-pro",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Set for reproducible generation",
        default=None,
    )
    steps: int = Field(
        title="Steps",
        description="Number of diffusion steps",
        ge=1.0,
        le=50.0,
        default=25,
    )
    prompt: str | None = Field(
        title="Prompt", description="Text prompt for image generation", default=None
    )
    guidance: float = Field(
        title="Guidance",
        description="Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt.",
        ge=2.0,
        le=5.0,
        default=3,
    )
    interval: float = Field(
        title="Interval",
        description="Interval is a setting that increases the variance in possible outputs letting the model be a tad more dynamic in what outputs it may produce in terms of composition, color, detail, and prompt interpretation. Setting this value low will ensure strong prompt following with more consistent outputs, setting it higher will produce more dynamic or varied outputs.",
        ge=1.0,
        le=4.0,
        default=2,
    )
    aspect_ratio: Aspect_ratio = Field(
        description="Aspect ratio for the generated image", default=Aspect_ratio("1:1")
    )
    safety_tolerance: int = Field(
        title="Safety Tolerance",
        description="Safety tolerance, 1 is most strict and 5 is most permissive",
        ge=1.0,
        le=5.0,
        default=2,
    )


class SDXL_Controlnet(ReplicateNode):
    """SDXL ControlNet - Canny"""

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/sdxl-controlnet:06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/7edf6f87-bd0d-4a4f-9e11-d944bb07a3ea/output.png",
            "created_at": "2023-08-14T07:15:37.417194Z",
            "description": "SDXL ControlNet - Canny",
            "github_url": "https://github.com/lucataco/cog-sdxl-controlnet",
            "license_url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md",
            "name": "sdxl-controlnet",
            "owner": "lucataco",
            "paper_url": None,
            "run_count": 1660062,
            "url": "https://replicate.com/lucataco/sdxl-controlnet",
            "visibility": "public",
        }

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
        return "None"

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
            "run_count": 278740,
            "url": "https://replicate.com/catacolabs/sdxl-ad-inpaint",
            "visibility": "public",
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
        title="Num Inference Steps", description="Inference Steps", default=40
    )


class Kandinsky(ReplicateNode):
    """multilingual text2image latent diffusion model"""

    class Width(int, Enum):
        _384 = 384
        _512 = 512
        _576 = 576
        _640 = 640
        _704 = 704
        _768 = 768
        _960 = 960
        _1024 = 1024
        _1152 = 1152
        _1280 = 1280
        _1536 = 1536
        _1792 = 1792
        _2048 = 2048

    class Height(int, Enum):
        _384 = 384
        _512 = 512
        _576 = 576
        _640 = 640
        _704 = 704
        _768 = 768
        _960 = 960
        _1024 = 1024
        _1152 = 1152
        _1280 = 1280
        _1536 = 1536
        _1792 = 1792
        _2048 = 2048

    class Output_format(str, Enum):
        WEBP = "webp"
        JPEG = "jpeg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/Lca3IEjcKoJBBVS6ajROkK37sDzPsmjYxIcFzxPZp65wZzTE/out-0.png",
            "created_at": "2023-07-12T21:53:29.439515Z",
            "description": "multilingual text2image latent diffusion model",
            "github_url": "https://github.com/chenxwh/Kandinsky-2/tree/v2.2",
            "license_url": "https://github.com/ai-forever/Kandinsky-2/blob/main/license",
            "name": "kandinsky-2.2",
            "owner": "ai-forever",
            "paper_url": None,
            "run_count": 9992781,
            "url": "https://replicate.com/ai-forever/kandinsky-2.2",
            "visibility": "public",
        }

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
        default=Width(512),
    )
    height: Height = Field(
        description="Height of output image. Lower the setting if hits memory limits.",
        default=Height(512),
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
        description="Output image format", default=Output_format("webp")
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

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"
        DPM__2MSDE = "DPM++2MSDE"

    @classmethod
    def replicate_model_id(cls):
        return "bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8f"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/dYdYGKKt04pHJ1kle3eStm3q4mfPiUFlQ5xGeM3mfboYbMPUC/out-0.png",
            "created_at": "2024-02-21T07:36:15.534380Z",
            "description": "SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps",
            "github_url": "https://github.com/lucataco/cog-sdxl-lightning-4step",
            "license_url": "https://huggingface.co/ByteDance/SDXL-Lightning/blob/main/LICENSE.md",
            "name": "sdxl-lightning-4step",
            "owner": "bytedance",
            "paper_url": "https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_report.pdf",
            "run_count": 405216567,
            "url": "https://replicate.com/bytedance/sdxl-lightning-4step",
            "visibility": "public",
        }

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
    scheduler: Scheduler = Field(description="scheduler", default=Scheduler("K_EULER"))
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

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"
        DPM__2MKARRAS = "DPM++2MKarras"
        DPMSOLVER = "DPMSolver++"

    @classmethod
    def replicate_model_id(cls):
        return "playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/XAK4XRgpjYaCGRrm9yxzO2bacj4XTE1Nl6bwaXKOHKYApJoE/out-0.png",
            "created_at": "2024-02-27T22:20:16.107222Z",
            "description": "Playground v2.5 is the state-of-the-art open-source model in aesthetic quality",
            "github_url": "https://github.com/lucataco/cog-playground-v2.5-1024px-aesthetic",
            "license_url": "https://huggingface.co/playgroundai/playground-v2.5-1024px-aesthetic/blob/main/LICENSE.md",
            "name": "playground-v2.5-1024px-aesthetic",
            "owner": "playgroundai",
            "paper_url": "https://arxiv.org/abs/2206.00364",
            "run_count": 1390940,
            "url": "https://replicate.com/playgroundai/playground-v2.5-1024px-aesthetic",
            "visibility": "public",
        }

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
        default=Scheduler("DPMSolver++"),
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


class Proteus_V0_3(ReplicateNode):
    """ProteusV0.3: The Anime Update"""

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        HEUNDISCRETE = "HeunDiscrete"
        KARRASDPM = "KarrasDPM"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"
        PNDM = "PNDM"
        DPM__2MSDE = "DPM++2MSDE"

    @classmethod
    def replicate_model_id(cls):
        return "datacte/proteus-v0.3:b28b79d725c8548b173b6a19ff9bffd16b9b80df5b18b8dc5cb9e1ee471bfa48"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/C3LYYa30997dKRdeNDSXNjIK01CH5q8CSto12eWundnPPtWSA/out-0.png",
            "created_at": "2024-02-14T20:02:04.901849Z",
            "description": "ProteusV0.3: The Anime Update",
            "github_url": "https://github.com/lucataco/cog-proteus-v0.3",
            "license_url": "https://huggingface.co/models?license=license:gpl-3.0",
            "name": "proteus-v0.3",
            "owner": "datacte",
            "paper_url": None,
            "run_count": 1328512,
            "url": "https://replicate.com/datacte/proteus-v0.3",
            "visibility": "public",
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
        default="Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)",
    )
    scheduler: Scheduler = Field(
        description="scheduler", default=Scheduler("DPM++2MSDE")
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
        description="Scale for classifier-free guidance. Recommended 7-8",
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
        default="worst quality, low quality",
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


class StickerMaker(ReplicateNode):
    """Make stickers with AI. Generates graphics with transparent backgrounds."""

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/sticker-maker:4acb778eb059772225ec213948f0660867b2e03f277448f18cf1800b96a65a1a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/89kikrVNWfxve0Oy3YjWHqpXri9FeejOfDbP1Kdhcq7uPkqVC/ComfyUI_00001_.webp",
            "created_at": "2024-02-23T11:59:22.452180Z",
            "description": "Make stickers with AI. Generates graphics with transparent backgrounds.",
            "github_url": "https://github.com/fofr/cog-stickers",
            "license_url": "https://github.com/fofr/cog-stickers/blob/main/LICENSE",
            "name": "sticker-maker",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 500017,
            "url": "https://replicate.com/fofr/sticker-maker",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Fix the random seed for reproducibility",
        default=None,
    )
    steps: int = Field(title="Steps", default=17)
    width: int = Field(title="Width", default=1152)
    height: int = Field(title="Height", default=1152)
    prompt: str = Field(title="Prompt", default="a cute cat")
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("webp")
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.",
        ge=0.0,
        le=100.0,
        default=90,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want in the image",
        default="",
    )
    number_of_images: int = Field(
        title="Number Of Images",
        description="Number of images to generate",
        ge=1.0,
        le=10.0,
        default=1,
    )


class StyleTransfer(ReplicateNode):
    """Transfer the style of one image to another"""

    class Model(str, Enum):
        FAST = "fast"
        HIGH_QUALITY = "high-quality"
        REALISTIC = "realistic"
        CINEMATIC = "cinematic"
        ANIMATED = "animated"

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/style-transfer:f1023890703bc0a5a3a2c21b5e498833be5f6ef6e70e9daf6b9b3a4fd8309cf0"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/wmtBOf7pSlzHF6RBbeG5YpIXEYkRlGcoTpnOMi2Fqg9EUeWlA/ComfyUI_00001_.webp",
            "created_at": "2024-04-17T20:34:49.861066Z",
            "description": "Transfer the style of one image to another",
            "github_url": "https://github.com/fofr/cog-style-transfer",
            "license_url": "https://github.com/fofr/cog-style-transfer/blob/main/LICENSE",
            "name": "style-transfer",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 259546,
            "url": "https://replicate.com/fofr/style-transfer",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    model: Model = Field(
        description="Model to use for the generation", default=Model("fast")
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
        description="Prompt for the image",
        default="An astronaut riding a unicorn",
    )
    style_image: ImageRef = Field(
        default=ImageRef(), description="Copy the style from this image"
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
    structure_image: ImageRef = Field(
        default=ImageRef(),
        description="An optional image to copy structure from. Output images will use the same aspect ratio.",
    )
    number_of_images: int = Field(
        title="Number Of Images",
        description="Number of images to generate",
        ge=1.0,
        le=10.0,
        default=1,
    )
    structure_depth_strength: float = Field(
        title="Structure Depth Strength",
        description="Strength of the depth controlnet",
        ge=0.0,
        le=2.0,
        default=1,
    )
    structure_denoising_strength: float = Field(
        title="Structure Denoising Strength",
        description="How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance)",
        ge=0.0,
        le=1.0,
        default=0.65,
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
        return "None"

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
            "run_count": 22710,
            "url": "https://replicate.com/fofr/illusions",
            "visibility": "public",
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
        title="Num Inference Steps", description="Number of diffusion steps", default=40
    )
    controlnet_conditioning_scale: float = Field(
        title="Controlnet Conditioning Scale",
        description="How strong the controlnet conditioning is",
        default=0.75,
    )
