from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Pixel(str, Enum):
    _512___512 = '512 * 512'
    _768___768 = '768 * 768'
    _1024___1024 = '1024 * 1024'
class Product_size(str, Enum):
    ORIGINAL = 'Original'
    _0_6___WIDTH = '0.6 * width'
    _0_5___WIDTH = '0.5 * width'
    _0_4___WIDTH = '0.4 * width'
    _0_3___WIDTH = '0.3 * width'
    _0_2___WIDTH = '0.2 * width'


class AdInpaint(ReplicateNode):
    """Product advertising image generator"""

    def replicate_model_id(self): return 'logerzhu/ad-inpaint:b1c17d148455c1fda435ababe9ab1e03bc0d917cc3cf4251916f22c45c83c7df'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/3ZmtvTJWj3a0Al9XR7SSKqpAfLTZtrkM7t5KjLvz7Nqsv3pIA/ad_inpaint_3.jpg', 'created_at': '2023-04-03T11:25:28.290524Z', 'description': 'Product advertising image generator', 'github_url': None, 'license_url': None, 'name': 'ad-inpaint', 'owner': 'logerzhu', 'paper_url': None, 'run_count': 359505, 'url': 'https://replicate.com/logerzhu/ad-inpaint', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    pixel: Pixel = Field(description='image total pixel', default='512 * 512')
    scale: int = Field(title='Scale', description='Factor to scale image by (maximum: 4)', ge=0.0, le=4.0, default=3)
    prompt: str | None = Field(title='Prompt', description='Product name or prompt', default=None)
    image_num: int = Field(title='Image Num', description='Number of image to generate', ge=0.0, le=4.0, default=1)
    image_path: ImageRef = Field(default=ImageRef(), description='input image')
    manual_seed: int = Field(title='Manual Seed', description='Manual Seed', default=-1)
    product_size: Product_size = Field(description='Max product size', default='Original')
    guidance_scale: float = Field(title='Guidance Scale', description='Guidance Scale', default=7.5)
    negative_prompt: str = Field(title='Negative Prompt', description="Anything you don't want in the photo", default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement')
    num_inference_steps: int = Field(title='Num Inference Steps', description='Inference Steps', default=20)

class Scheduler(str, Enum):
    DDIM = 'DDIM'
    DPMSOLVERMULTISTEP = 'DPMSolverMultistep'
    HEUNDISCRETE = 'HeunDiscrete'
    KARRASDPM = 'KarrasDPM'
    K_EULER_ANCESTRAL = 'K_EULER_ANCESTRAL'
    K_EULER = 'K_EULER'
    PNDM = 'PNDM'
    DPM__2MSDE = 'DPM++2MSDE'


class Proteus(ReplicateNode):
    """ProteusV0.4: The Style Update"""

    def replicate_model_id(self): return 'lucataco/proteus-v0.4:34a427535a3c45552b94369280b823fcd0e5c9710e97af020bf445c033d4569e'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/3WJYR5U1mhJCHhWQKCKnr2ZifNcIeaAIBrZrZqijemJtZS1kA/out-0.png', 'created_at': '2024-02-26T19:01:05.593762Z', 'description': 'ProteusV0.4: The Style Update', 'github_url': 'https://github.com/lucataco/cog-proteus-v0.4', 'license_url': 'https://huggingface.co/models?license=license%3Agpl-3.0', 'name': 'proteus-v0.4', 'owner': 'lucataco', 'paper_url': None, 'run_count': 34998, 'url': 'https://replicate.com/lucataco/proteus-v0.4', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image. Recommended 1024 or 1280', default=1024)
    height: int = Field(title='Height', description='Height of output image. Recommended 1024 or 1280', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed')
    scheduler: Scheduler = Field(description='scheduler', default='DPM++2MSDE')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance. Recommended 4-6', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    negative_prompt: str = Field(title='Negative Prompt', description='Negative Input prompt', default='nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results.', ge=1.0, le=100.0, default=20)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety', default=False)

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

    def replicate_model_id(self): return 'stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/sWeZFZou6v3CPKuoJbqX46ugPaHT1DcsWYx0srPmGrMOCPYIA/out-0.png', 'created_at': '2022-08-22T21:37:08.396208Z', 'description': 'A latent text-to-image diffusion model capable of generating photo-realistic images given any text input', 'github_url': 'https://github.com/replicate/cog-stable-diffusion', 'license_url': 'https://huggingface.co/spaces/CompVis/stable-diffusion-license', 'name': 'stable-diffusion', 'owner': 'stability-ai', 'paper_url': 'https://arxiv.org/abs/2112.10752', 'run_count': 107815798, 'url': 'https://replicate.com/stability-ai/stable-diffusion', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    width: Width = Field(description='Width of generated image in pixels. Needs to be a multiple of 64', default=768)
    height: Height = Field(description='Height of generated image in pixels. Needs to be a multiple of 64', default=768)
    prompt: str = Field(title='Prompt', description='Input prompt', default='a vision of paradise. unreal engine')
    scheduler: Scheduler = Field(description='Choose a scheduler.', default='DPMSolverMultistep')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to generate.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=20.0, default=7.5)
    negative_prompt: str | None = Field(title='Negative Prompt', description='Specify things to not see in the output', default=None)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=50)



class Controlnet_Realistic_Vision(ReplicateNode):
    """controlnet 1.1 lineart x realistic-vision-v2.0 (updated to v5)"""

    def replicate_model_id(self): return 'usamaehsan/controlnet-1.1-x-realistic-vision-v2.0:51778c7522eb99added82c0c52873d7a391eecf5fcc3ac7856613b7e6443f2f7'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/6SH5eZLRSZ3wXaq2mfQ6eNqen8Gc9dURnpfqym1Z14fa83UcE/output.png', 'created_at': '2023-05-19T03:51:16.901441Z', 'description': 'controlnet 1.1 lineart x realistic-vision-v2.0 (updated to v5)', 'github_url': None, 'license_url': None, 'name': 'controlnet-1.1-x-realistic-vision-v2.0', 'owner': 'usamaehsan', 'paper_url': None, 'run_count': 3321301, 'url': 'https://replicate.com/usamaehsan/controlnet-1.1-x-realistic-vision-v2.0', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Leave blank to randomize', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image')
    steps: int = Field(title='Steps', description=' num_inference_steps', ge=0.0, le=100.0, default=20)
    prompt: str = Field(title='Prompt', default='(a tabby cat)+++, high resolution, sitting on a park bench')
    strength: float = Field(title='Strength', description='control strength/weight', ge=0.0, le=2.0, default=0.8)
    max_width: float = Field(title='Max Width', description='max width of mask/image', ge=128.0, default=612)
    max_height: float = Field(title='Max Height', description='max height of mask/image', ge=128.0, default=612)
    guidance_scale: int = Field(title='Guidance Scale', description='guidance_scale', ge=0.0, le=30.0, default=10)
    negative_prompt: str = Field(title='Negative Prompt', default='(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck')

class Refine(str, Enum):
    NO_REFINER = 'no_refiner'
    EXPERT_ENSEMBLE_REFINER = 'expert_ensemble_refiner'
    BASE_IMAGE_REFINER = 'base_image_refiner'


class StableDiffusionXL(ReplicateNode):
    """A text-to-image generative AI model that creates beautiful images"""

    def replicate_model_id(self): return 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://tjzk.replicate.delivery/models_models_cover_image/61004930-fb88-4e09-9bd4-74fd8b4aa677/sdxl_cover.png', 'created_at': '2023-07-26T17:53:09.882651Z', 'description': 'A text-to-image generative AI model that creates beautiful images', 'github_url': 'https://github.com/replicate/cog-sdxl', 'license_url': 'https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SDXL1.0', 'name': 'sdxl', 'owner': 'stability-ai', 'paper_url': 'https://arxiv.org/abs/2307.01952', 'run_count': 49775747, 'url': 'https://replicate.com/stability-ai/sdxl', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', default=1024)
    height: int = Field(title='Height', description='Height of output image', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='An astronaut riding a rainbow unicorn')
    refine: Refine = Field(description='Which refine style to use', default='no_refiner')
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    lora_scale: float = Field(title='Lora Scale', description='LoRA additive scale. Only applicable on trained models.', ge=0.0, le=1.0, default=0.6)
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    refine_steps: int | None = Field(title='Refine Steps', description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps', default=None)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    high_noise_frac: float = Field(title='High Noise Frac', description='For expert_ensemble_refiner, the fraction of noise to use', ge=0.0, le=1.0, default=0.8)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    replicate_weights: str | None = Field(title='Replicate Weights', description='Replicate LoRA weights to use. Leave blank to use the default weights.', default=None)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=50)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety', default=False)



class Juggernaut_XL_V9(ReplicateNode):
    """Juggernaut XL v9"""

    def replicate_model_id(self): return 'lucataco/juggernaut-xl-v9:bea09cf018e513cef0841719559ea86d2299e05448633ac8fe270b5d5cd6777e'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/I2fZYRjmiKVpWCVhi9guAaUpXrZeLfM28fkjr7NYQyh5DVtJB/out-0.png', 'created_at': '2024-02-28T21:01:49.723331Z', 'description': 'Juggernaut XL v9', 'github_url': 'https://github.com/lucataco/cog-juggernaut-xl-v9', 'license_url': 'https://github.com/Stability-AI/generative-models/blob/main/model_licenses/LICENSE-SDXL1.0', 'name': 'juggernaut-xl-v9', 'owner': 'lucataco', 'paper_url': None, 'run_count': 268490, 'url': 'https://replicate.com/lucataco/juggernaut-xl-v9', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    width: int = Field(title='Width', description='Width of output image', default=1024)
    height: int = Field(title='Height', description='Height of output image', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='beautiful lady, (freckles), big smile, ruby eyes, short hair, dark makeup, hyperdetailed photography, soft light, head and shoulders portrait, cover')
    scheduler: Scheduler = Field(description='scheduler', default='DPM++SDE')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=20.0, default=2)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='CGI, Unreal, Airbrushed, Digital')
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=100.0, default=5)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)', default=False)



class SDXL_Pixar(ReplicateNode):
    """Create Pixar poster easily with SDXL Pixar."""

    def replicate_model_id(self): return 'swartype/sdxl-pixar:81f8bbd3463056c8521eb528feb10509cc1385e2fabef590747f159848589048'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://tjzk.replicate.delivery/models_models_cover_image/68125b17-60d7-4949-8984-0d50d736a623/out-0_5.png', 'created_at': '2023-10-21T10:32:49.911227Z', 'description': 'Create Pixar poster easily with SDXL Pixar.', 'github_url': None, 'license_url': None, 'name': 'sdxl-pixar', 'owner': 'swartype', 'paper_url': None, 'run_count': 502419, 'url': 'https://replicate.com/swartype/sdxl-pixar', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', default=1024)
    height: int = Field(title='Height', description='Height of output image', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='An astronaut riding a rainbow unicorn')
    refine: Refine = Field(description='Which refine style to use', default='no_refiner')
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    lora_scale: float = Field(title='Lora Scale', description='LoRA additive scale. Only applicable on trained models.', ge=0.0, le=1.0, default=0.6)
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    refine_steps: int | None = Field(title='Refine Steps', description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps', default=None)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    high_noise_frac: float = Field(title='High Noise Frac', description='For expert_ensemble_refiner, the fraction of noise to use', ge=0.0, le=1.0, default=0.8)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    replicate_weights: str | None = Field(title='Replicate Weights', description='Replicate LoRA weights to use. Leave blank to use the default weights.', default=None)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=50)



class SDXL_Emoji(ReplicateNode):
    """An SDXL fine-tune based on Apple Emojis"""

    def replicate_model_id(self): return 'fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/a3z81v5vwlKfLq1H5uBqpVmkHalOVup0jSLma9E2UaF3tawIA/out-0.png', 'created_at': '2023-09-04T09:18:11.028708Z', 'description': 'An SDXL fine-tune based on Apple Emojis', 'github_url': None, 'license_url': None, 'name': 'sdxl-emoji', 'owner': 'fofr', 'paper_url': None, 'run_count': 4135076, 'url': 'https://replicate.com/fofr/sdxl-emoji', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', default=1024)
    height: int = Field(title='Height', description='Height of output image', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='An astronaut riding a rainbow unicorn')
    refine: Refine = Field(description='Which refine style to use', default='no_refiner')
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    lora_scale: float = Field(title='Lora Scale', description='LoRA additive scale. Only applicable on trained models.', ge=0.0, le=1.0, default=0.6)
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    refine_steps: int | None = Field(title='Refine Steps', description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps', default=None)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    high_noise_frac: float = Field(title='High Noise Frac', description='For expert_ensemble_refiner, the fraction of noise to use', ge=0.0, le=1.0, default=0.8)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    replicate_weights: str | None = Field(title='Replicate Weights', description='Replicate LoRA weights to use. Leave blank to use the default weights.', default=None)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=50)



class StableDiffusionInpainting(ReplicateNode):
    """SDXL Inpainting developed by the HF Diffusers team"""

    def replicate_model_id(self): return 'lucataco/sdxl-inpainting:a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/5uUmO34KUZKsAJkcc82gC17WZdJgrbtRpRebyLYo9EJGHqOJA/out-0.png', 'created_at': '2023-10-17T03:53:36.563598Z', 'description': 'SDXL Inpainting developed by the HF Diffusers team', 'github_url': 'https://github.com/lucataco/cog-sdxl-inpainting', 'license_url': 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md', 'name': 'sdxl-inpainting', 'owner': 'lucataco', 'paper_url': 'https://huggingface.co/papers/2112.10752', 'run_count': 128372, 'url': 'https://replicate.com/lucataco/sdxl-inpainting', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: str | None = Field(title='Mask', description="Mask image - make sure it's the same size as the input image", default=None)
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image')
    steps: int = Field(title='Steps', description='Number of denoising steps', ge=1.0, le=80.0, default=20)
    prompt: str = Field(title='Prompt', description='Input prompt', default='modern bed with beige sheet and pillows')
    strength: float = Field(title='Strength', description='1.0 corresponds to full destruction of information in image', ge=0.01, le=1.0, default=0.7)
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output. Higher number of outputs may OOM.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Guidance scale', ge=0.0, le=10.0, default=8)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='monochrome, lowres, bad anatomy, worst quality, low quality')

class Controlnet_1(str, Enum):
    NONE = 'none'
    EDGE_CANNY = 'edge_canny'
    ILLUSION = 'illusion'
    DEPTH_LERES = 'depth_leres'
    DEPTH_MIDAS = 'depth_midas'
    SOFT_EDGE_PIDI = 'soft_edge_pidi'
    SOFT_EDGE_HED = 'soft_edge_hed'
    LINEART = 'lineart'
    LINEART_ANIME = 'lineart_anime'
    OPENPOSE = 'openpose'
class Controlnet_2(str, Enum):
    NONE = 'none'
    EDGE_CANNY = 'edge_canny'
    ILLUSION = 'illusion'
    DEPTH_LERES = 'depth_leres'
    DEPTH_MIDAS = 'depth_midas'
    SOFT_EDGE_PIDI = 'soft_edge_pidi'
    SOFT_EDGE_HED = 'soft_edge_hed'
    LINEART = 'lineart'
    LINEART_ANIME = 'lineart_anime'
    OPENPOSE = 'openpose'
class Controlnet_3(str, Enum):
    NONE = 'none'
    EDGE_CANNY = 'edge_canny'
    ILLUSION = 'illusion'
    DEPTH_LERES = 'depth_leres'
    DEPTH_MIDAS = 'depth_midas'
    SOFT_EDGE_PIDI = 'soft_edge_pidi'
    SOFT_EDGE_HED = 'soft_edge_hed'
    LINEART = 'lineart'
    LINEART_ANIME = 'lineart_anime'
    OPENPOSE = 'openpose'
class Sizing_strategy(str, Enum):
    WIDTH_HEIGHT = 'width_height'
    INPUT_IMAGE = 'input_image'
    CONTROLNET_1_IMAGE = 'controlnet_1_image'
    CONTROLNET_2_IMAGE = 'controlnet_2_image'
    CONTROLNET_3_IMAGE = 'controlnet_3_image'
    MASK_IMAGE = 'mask_image'


class RealVisXL_V3_Multi_Controlnet_Lora(ReplicateNode):
    """RealVisXl V3 with multi-controlnet, lora loading, img2img, inpainting"""

    def replicate_model_id(self): return 'fofr/realvisxl-v3-multi-controlnet-lora:90a4a3604cd637cb9f1a2bdae1cfa9ed869362ca028814cdce310a78e27daade'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/mUtp8mKk8yI0EJ5olzsnpkeTbAcmy2OTEqnXXc8EFGLhhuEJA/out-0.png', 'created_at': '2024-01-05T14:05:27.681939Z', 'description': 'RealVisXl V3 with multi-controlnet, lora loading, img2img, inpainting', 'github_url': 'https://github.com/fofr/cog-realvisxl-3-multi-controlnet-lora', 'license_url': 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md', 'name': 'realvisxl-v3-multi-controlnet-lora', 'owner': 'fofr', 'paper_url': 'https://huggingface.co/SG161222/RealVisXL_V3.0', 'run_count': 242742, 'url': 'https://replicate.com/fofr/realvisxl-v3-multi-controlnet-lora', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', default=768)
    height: int = Field(title='Height', description='Height of output image', default=768)
    prompt: str = Field(title='Prompt', description='Input prompt', default='An astronaut riding a rainbow unicorn')
    refine: Refine = Field(description='Which refine style to use', default='no_refiner')
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    lora_scale: float = Field(title='Lora Scale', description='LoRA additive scale. Only applicable on trained models.', ge=0.0, le=1.0, default=0.6)
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output', ge=1.0, le=4.0, default=1)
    controlnet_1: Controlnet_1 = Field(description='Controlnet', default='none')
    controlnet_2: Controlnet_2 = Field(description='Controlnet', default='none')
    controlnet_3: Controlnet_3 = Field(description='Controlnet', default='none')
    lora_weights: str | None = Field(title='Lora Weights', description='Replicate LoRA weights to use. Leave blank to use the default weights.', default=None)
    refine_steps: int | None = Field(title='Refine Steps', description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps', default=None)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=False)
    negative_prompt: str = Field(title='Negative Prompt', description='Negative Prompt', default='')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    sizing_strategy: Sizing_strategy = Field(description='Decide how to resize images – use width/height, resize based on input image or control image', default='width_height')
    controlnet_1_end: float = Field(title='Controlnet 1 End', description='When controlnet conditioning ends', ge=0.0, le=1.0, default=1)
    controlnet_2_end: float = Field(title='Controlnet 2 End', description='When controlnet conditioning ends', ge=0.0, le=1.0, default=1)
    controlnet_3_end: float = Field(title='Controlnet 3 End', description='When controlnet conditioning ends', ge=0.0, le=1.0, default=1)
    controlnet_1_image: ImageRef = Field(default=ImageRef(), description='Input image for first controlnet')
    controlnet_1_start: float = Field(title='Controlnet 1 Start', description='When controlnet conditioning starts', ge=0.0, le=1.0, default=0)
    controlnet_2_image: ImageRef = Field(default=ImageRef(), description='Input image for second controlnet')
    controlnet_2_start: float = Field(title='Controlnet 2 Start', description='When controlnet conditioning starts', ge=0.0, le=1.0, default=0)
    controlnet_3_image: ImageRef = Field(default=ImageRef(), description='Input image for third controlnet')
    controlnet_3_start: float = Field(title='Controlnet 3 Start', description='When controlnet conditioning starts', ge=0.0, le=1.0, default=0)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=30)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API.', default=False)
    controlnet_1_conditioning_scale: float = Field(title='Controlnet 1 Conditioning Scale', description='How strong the controlnet conditioning is', ge=0.0, le=4.0, default=0.75)
    controlnet_2_conditioning_scale: float = Field(title='Controlnet 2 Conditioning Scale', description='How strong the controlnet conditioning is', ge=0.0, le=4.0, default=0.75)
    controlnet_3_conditioning_scale: float = Field(title='Controlnet 3 Conditioning Scale', description='How strong the controlnet conditioning is', ge=0.0, le=4.0, default=0.75)



class OpenDalle_Lora(ReplicateNode):
    """Better than SDXL at both prompt adherence and image quality, by dataautogpt3"""

    def replicate_model_id(self): return 'batouresearch/open-dalle-1.1-lora:2ade2cbfc88298b98366a6e361559e11666c17ed415d341c9ae776b30a61b196'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/yh0AaQWOrfS1Ua9oGIXeu6JfmSSB07xwfMkkaq374aWXuqcIB/out-0.png', 'created_at': '2023-12-29T16:10:05.714877Z', 'description': 'Better than SDXL at both prompt adherence and image quality, by dataautogpt3', 'github_url': None, 'license_url': None, 'name': 'open-dalle-1.1-lora', 'owner': 'batouresearch', 'paper_url': None, 'run_count': 101364, 'url': 'https://replicate.com/batouresearch/open-dalle-1.1-lora', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: ImageRef = Field(default=ImageRef(), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', default=1024)
    height: int = Field(title='Height', description='Height of output image', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='An astronaut riding a rainbow unicorn')
    refine: Refine = Field(description='Which refine style to use', default='no_refiner')
    scheduler: Scheduler = Field(description='scheduler', default='KarrasDPM')
    lora_scale: float = Field(title='Lora Scale', description='LoRA additive scale. Only applicable on trained models.', ge=0.0, le=1.0, default=0.6)
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    lora_weights: str | None = Field(title='Lora Weights', description='Replicate LoRA weights to use. Leave blank to use the default weights.', default=None)
    refine_steps: int | None = Field(title='Refine Steps', description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps', default=None)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=1.0, le=50.0, default=7.5)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=False)
    high_noise_frac: float = Field(title='High Noise Frac', description='For expert_ensemble_refiner, the fraction of noise to use', ge=0.0, le=1.0, default=0.8)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=35)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)', default=False)

class Ip_adapter_ckpt(str, Enum):
    IP_ADAPTER_SD15_BIN = 'ip-adapter_sd15.bin'
    IP_ADAPTER_PLUS_SD15_BIN = 'ip-adapter-plus_sd15.bin'
    IP_ADAPTER_PLUS_FACE_SD15_BIN = 'ip-adapter-plus-face_sd15.bin'


class Controlnet_X_IP_Adapter_Realistic_Vision_V5(ReplicateNode):
    """Inpainting || multi-controlnet || single-controlnet || ip-adapter || ip adapter face || ip adapter plus || No ip adapter"""

    def replicate_model_id(self): return 'usamaehsan/controlnet-x-ip-adapter-realistic-vision-v5:50ac06bb9bcf30e7b5dc66d3fe6e67262059a11ade572a35afa0ef686f55db82'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/8I5Ibs22qcKMMh5VuT3abac9kgf91HB33Px5APKVe78zBHaSA/output_0.png', 'created_at': '2023-11-23T22:11:33.960507Z', 'description': 'Inpainting || multi-controlnet || single-controlnet || ip-adapter || ip adapter face || ip adapter plus || No ip adapter', 'github_url': None, 'license_url': None, 'name': 'controlnet-x-ip-adapter-realistic-vision-v5', 'owner': 'usamaehsan', 'paper_url': None, 'run_count': 251403, 'url': 'https://replicate.com/usamaehsan/controlnet-x-ip-adapter-realistic-vision-v5', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    eta: float = Field(title='Eta', description='Controls the amount of noise that is added to the input data during the denoising diffusion process. Higher value -> more noise', default=0)
    seed: int | None = Field(title='Seed', description='Seed', default=None)
    prompt: str | None = Field(title='Prompt', description='Prompt - using compel, use +++ to increase words weight:: doc: https://github.com/damian0815/compel/tree/main/doc || https://invoke-ai.github.io/InvokeAI/features/PROMPTS/#attention-weighting', default=None)
    max_width: int = Field(title='Max Width', description='Max width/Resolution of image', default=512)
    scheduler: Scheduler = Field(description='Choose a scheduler.', default='DDIM')
    guess_mode: bool = Field(title='Guess Mode', description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.', default=False)
    int_kwargs: str = Field(title='Int Kwargs', default='')
    mask_image: ImageRef = Field(default=ImageRef(), description='mask image for inpainting controlnet')
    max_height: int = Field(title='Max Height', description='Max height/Resolution of image', default=512)
    tile_image: ImageRef = Field(default=ImageRef(), description='Control image for tile controlnet')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to generate', ge=1.0, le=10.0, default=1)
    img2img_image: str | None = Field(title='Img2Img Image', description='Image2image image', default=None)
    lineart_image: ImageRef = Field(default=ImageRef(), description='Control image for canny controlnet')
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=0.1, le=30.0, default=7)
    scribble_image: ImageRef = Field(default=ImageRef(), description='Control image for scribble controlnet')
    ip_adapter_ckpt: Ip_adapter_ckpt = Field(description='IP Adapter checkpoint', default='ip-adapter_sd15.bin')
    negative_prompt: str = Field(title='Negative Prompt', description='Negative prompt - using compel, use +++ to increase words weight//// negative-embeddings available ///// FastNegativeV2 , boring_e621_v4 , verybadimagenegative_v1 || to use them, write their keyword in negative prompt', default='Longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality')
    brightness_image: ImageRef = Field(default=ImageRef(), description='Control image for brightness controlnet')
    img2img_strength: float = Field(title='Img2Img Strength', description='img2img strength, does not work when inpainting image is given, 0.1-same image, 0.99-complete destruction of image', default=0.5)
    inpainting_image: ImageRef = Field(default=ImageRef(), description='Control image for inpainting controlnet')
    ip_adapter_image: str | None = Field(title='Ip Adapter Image', description='IP Adapter image', default=None)
    ip_adapter_weight: float = Field(title='Ip Adapter Weight', description='IP Adapter weight', default=1)
    sorted_controlnets: str = Field(title='Sorted Controlnets', description='Comma seperated string of controlnet names, list of names: tile, inpainting, lineart,depth ,scribble , brightness /// example value: tile, inpainting, lineart ', default='lineart, tile, inpainting')
    inpainting_strength: float = Field(title='Inpainting Strength', description='inpainting strength', default=1)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Steps to run denoising', default=20)
    disable_safety_check: bool = Field(title='Disable Safety Check', description='Disable safety check. Use at your own risk!', default=False)
    film_grain_lora_weight: float = Field(title='Film Grain Lora Weight', description='disabled on 0', default=0)
    negative_auto_mask_text: str | None = Field(title='Negative Auto Mask Text', description="// seperated list of objects you dont want to mask - 'hairs // eyes // cloth' ", default=None)
    positive_auto_mask_text: str | None = Field(title='Positive Auto Mask Text', description="// seperated list of objects for mask, AI will auto create mask of these objects, if mask text is given, mask image will not work - 'hairs // eyes // cloth'", default=None)
    tile_conditioning_scale: float = Field(title='Tile Conditioning Scale', description='Conditioning scale for tile controlnet', default=1)
    add_more_detail_lora_scale: float = Field(title='Add More Detail Lora Scale', description='Scale/ weight of more_details lora, more scale = more details, disabled on 0', default=0.5)
    detail_tweaker_lora_weight: float = Field(title='Detail Tweaker Lora Weight', description='disabled on 0', default=0)
    lineart_conditioning_scale: float = Field(title='Lineart Conditioning Scale', description='Conditioning scale for canny controlnet', default=1)
    scribble_conditioning_scale: float = Field(title='Scribble Conditioning Scale', description='Conditioning scale for scribble controlnet', default=1)
    epi_noise_offset_lora_weight: float = Field(title='Epi Noise Offset Lora Weight', description='disabled on 0', default=0)
    brightness_conditioning_scale: float = Field(title='Brightness Conditioning Scale', description='Conditioning scale for brightness controlnet', default=1)
    inpainting_conditioning_scale: float = Field(title='Inpainting Conditioning Scale', description='Conditioning scale for inpaint controlnet', default=1)
    color_temprature_slider_lora_weight: float = Field(title='Color Temprature Slider Lora Weight', description='disabled on 0', default=0)



class SDXL_Controlnet(ReplicateNode):
    """SDXL ControlNet - Canny"""

    def replicate_model_id(self): return 'lucataco/sdxl-controlnet:06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b'
    def get_hardware(self): return 'Nvidia A40 GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://tjzk.replicate.delivery/models_models_cover_image/7edf6f87-bd0d-4a4f-9e11-d944bb07a3ea/output.png', 'created_at': '2023-08-14T07:15:37.417194Z', 'description': 'SDXL ControlNet - Canny', 'github_url': 'https://github.com/lucataco/cog-sdxl-controlnet', 'license_url': 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md', 'name': 'sdxl-controlnet', 'owner': 'lucataco', 'paper_url': None, 'run_count': 1000174, 'url': 'https://replicate.com/lucataco/sdxl-controlnet', 'visibility': 'public', 'hardware': 'Nvidia A40 GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int = Field(title='Seed', description='Random seed. Set to 0 to randomize the seed', default=0)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    prompt: str = Field(title='Prompt', description='Input prompt', default='aerial view, a futuristic research complex in a bright foggy jungle, hard lighting')
    condition_scale: float = Field(title='Condition Scale', description='controlnet conditioning scale for generalization', ge=0.0, le=1.0, default=0.5)
    negative_prompt: str = Field(title='Negative Prompt', description='Input Negative Prompt', default='low quality, bad quality, sketches')
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=50)

class Img_size(str, Enum):
    _512__2048 = '512, 2048'
    _512__1984 = '512, 1984'
    _512__1920 = '512, 1920'
    _512__1856 = '512, 1856'
    _576__1792 = '576, 1792'
    _576__1728 = '576, 1728'
    _576__1664 = '576, 1664'
    _640__1600 = '640, 1600'
    _640__1536 = '640, 1536'
    _704__1472 = '704, 1472'
    _704__1408 = '704, 1408'
    _704__1344 = '704, 1344'
    _768__1344 = '768, 1344'
    _768__1280 = '768, 1280'
    _832__1216 = '832, 1216'
    _832__1152 = '832, 1152'
    _896__1152 = '896, 1152'
    _896__1088 = '896, 1088'
    _960__1088 = '960, 1088'
    _960__1024 = '960, 1024'
    _1024__1024 = '1024, 1024'
    _1024__960 = '1024, 960'
    _1088__960 = '1088, 960'
    _1088__896 = '1088, 896'
    _1152__896 = '1152, 896'
    _1152__832 = '1152, 832'
    _1216__832 = '1216, 832'
    _1280__768 = '1280, 768'
    _1344__768 = '1344, 768'
    _1408__704 = '1408, 704'
    _1472__704 = '1472, 704'
    _1536__640 = '1536, 640'
    _1600__640 = '1600, 640'
    _1664__576 = '1664, 576'
    _1728__576 = '1728, 576'
    _1792__576 = '1792, 576'
    _1856__512 = '1856, 512'
    _1920__512 = '1920, 512'
    _1984__512 = '1984, 512'
    _2048__512 = '2048, 512'
class Product_fill(str, Enum):
    ORIGINAL = 'Original'
    _80 = '80'
    _70 = '70'
    _60 = '60'
    _50 = '50'
    _40 = '40'
    _30 = '30'
    _20 = '20'


class SDXL_Ad_Inpaint(ReplicateNode):
    """Product advertising image generator using SDXL"""

    def replicate_model_id(self): return 'catacolabs/sdxl-ad-inpaint:9c0cb4c579c54432431d96c70924afcca18983de872e8a221777fb1416253359'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://pbxt.replicate.delivery/ORbuWtoy0y6NI9f4DrJ2fxs92LgviBaOlzOVdYTr3pT8eKJjA/7-out.png', 'created_at': '2023-09-15T15:37:19.970710Z', 'description': 'Product advertising image generator using SDXL', 'github_url': 'https://github.com/CatacoLabs/cog-sdxl-ad-inpaint', 'license_url': 'https://github.com/huggingface/hfapi/blob/master/LICENSE', 'name': 'sdxl-ad-inpaint', 'owner': 'catacolabs', 'paper_url': None, 'run_count': 155096, 'url': 'https://replicate.com/catacolabs/sdxl-ad-inpaint', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Empty or 0 for a random image', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Remove background from this image')
    prompt: str | None = Field(title='Prompt', description='Describe the new setting for your product', default=None)
    img_size: Img_size = Field(description='Possible SDXL image sizes', default='1024, 1024')
    apply_img: bool = Field(title='Apply Img', description='Applies the original product image to the final result', default=True)
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    product_fill: Product_fill = Field(description='What percentage of the image width to fill with product', default='Original')
    guidance_scale: float = Field(title='Guidance Scale', description='Guidance Scale', default=7.5)
    condition_scale: float = Field(title='Condition Scale', description='controlnet conditioning scale for generalization', ge=0.3, le=0.9, default=0.9)
    negative_prompt: str = Field(title='Negative Prompt', description='Describe what you do not want in your setting', default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement')
    num_refine_steps: int = Field(title='Num Refine Steps', description='Number of steps to refine', ge=0.0, le=40.0, default=10)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Inference Steps', default=40)

class Output_format(str, Enum):
    WEBP = 'webp'
    JPEG = 'jpeg'
    PNG = 'png'


class Kandinsky(ReplicateNode):
    """multilingual text2image latent diffusion model"""

    def replicate_model_id(self): return 'ai-forever/kandinsky-2.2:ad9d7879fbffa2874e1d909d1d37d9bc682889cc65b31f7bb00d2362619f194a'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/Lca3IEjcKoJBBVS6ajROkK37sDzPsmjYxIcFzxPZp65wZzTE/out-0.png', 'created_at': '2023-07-12T21:53:29.439515Z', 'description': 'multilingual text2image latent diffusion model', 'github_url': 'https://github.com/chenxwh/Kandinsky-2/tree/v2.2', 'license_url': 'https://github.com/ai-forever/Kandinsky-2/blob/main/license', 'name': 'kandinsky-2.2', 'owner': 'ai-forever', 'paper_url': None, 'run_count': 8896909, 'url': 'https://replicate.com/ai-forever/kandinsky-2.2', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    width: Width = Field(description='Width of output image. Lower the setting if hits memory limits.', default=512)
    height: Height = Field(description='Height of output image. Lower the setting if hits memory limits.', default=512)
    prompt: str = Field(title='Prompt', description='Input prompt', default='A moss covered astronaut with a black background')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    output_format: Output_format = Field(description='Output image format', default='webp')
    negative_prompt: str | None = Field(title='Negative Prompt', description='Specify things to not see in the output', default=None)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=500.0, default=75)
    num_inference_steps_prior: int = Field(title='Num Inference Steps Prior', description='Number of denoising steps for priors', ge=1.0, le=500.0, default=25)



class StableDiffusionXLLightning(ReplicateNode):
    """SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps"""

    def replicate_model_id(self): return 'bytedance/sdxl-lightning-4step:727e49a643e999d602a896c774a0658ffefea21465756a6ce24b7ea4165eba6a'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/dYdYGKKt04pHJ1kle3eStm3q4mfPiUFlQ5xGeM3mfboYbMPUC/out-0.png', 'created_at': '2024-02-21T07:36:15.534380Z', 'description': 'SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps', 'github_url': 'https://github.com/lucataco/cog-sdxl-lightning-4step', 'license_url': 'https://huggingface.co/ByteDance/SDXL-Lightning/blob/main/LICENSE.md', 'name': 'sdxl-lightning-4step', 'owner': 'bytedance', 'paper_url': 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_report.pdf', 'run_count': 26983249, 'url': 'https://replicate.com/bytedance/sdxl-lightning-4step', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    width: int = Field(title='Width', description='Width of output image. Recommended 1024 or 1280', default=1024)
    height: int = Field(title='Height', description='Height of output image. Recommended 1024 or 1280', default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='A superhero smiling')
    scheduler: Scheduler = Field(description='scheduler', default='K_EULER')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance. Recommended 7-8', ge=0.0, le=50.0, default=0)
    negative_prompt: str = Field(title='Negative Prompt', description='Negative Input prompt', default='worst quality, low quality')
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps. 4 for best results', ge=1.0, le=10.0, default=4)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images', default=False)



class PlaygroundV2(ReplicateNode):
    """Playground v2.5 is the state-of-the-art open-source model in aesthetic quality"""

    def replicate_model_id(self): return 'playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24'
    def get_hardware(self): return 'Nvidia A100 (40GB) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/XAK4XRgpjYaCGRrm9yxzO2bacj4XTE1Nl6bwaXKOHKYApJoE/out-0.png', 'created_at': '2024-02-27T22:20:16.107222Z', 'description': 'Playground v2.5 is the state-of-the-art open-source model in aesthetic quality', 'github_url': 'https://github.com/lucataco/cog-playground-v2.5-1024px-aesthetic', 'license_url': 'https://huggingface.co/playgroundai/playground-v2.5-1024px-aesthetic/blob/main/LICENSE.md', 'name': 'playground-v2.5-1024px-aesthetic', 'owner': 'playgroundai', 'paper_url': 'https://arxiv.org/abs/2206.00364', 'run_count': 325601, 'url': 'https://replicate.com/playgroundai/playground-v2.5-1024px-aesthetic', 'visibility': 'public', 'hardware': 'Nvidia A100 (40GB) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    mask: str | None = Field(title='Mask', description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.', default=None)
    seed: int | None = Field(title='Seed', description='Random seed. Leave blank to randomize the seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Input image for img2img or inpaint mode')
    width: int = Field(title='Width', description='Width of output image', ge=256.0, le=1536.0, default=1024)
    height: int = Field(title='Height', description='Height of output image', ge=256.0, le=1536.0, default=1024)
    prompt: str = Field(title='Prompt', description='Input prompt', default='Astronaut in a jungle, cold color palette, muted colors, detailed, 8k')
    scheduler: Scheduler = Field(description='Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases', default='DPMSolver++')
    num_outputs: int = Field(title='Num Outputs', description='Number of images to output.', ge=1.0, le=4.0, default=1)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', ge=0.1, le=20.0, default=3)
    apply_watermark: bool = Field(title='Apply Watermark', description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.', default=True)
    negative_prompt: str = Field(title='Negative Prompt', description='Negative Input prompt', default='ugly, deformed, noisy, blurry, distorted')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', ge=0.0, le=1.0, default=0.8)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of denoising steps', ge=1.0, le=60.0, default=25)
    disable_safety_checker: bool = Field(title='Disable Safety Checker', description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety', default=False)



class Illusions(ReplicateNode):
    """Create illusions with img2img and masking support"""

    def replicate_model_id(self): return 'fofr/illusions:579b32db82b24584c3c6155fe3ae12e8fce50ba28b575c23e8a1f5f3a5e99ed8'
    def get_hardware(self): return 'Nvidia A40 (Large) GPU'
    @classmethod
    def model_info(cls): return {'cover_image_url': 'https://replicate.delivery/pbxt/0mvORZpRyI4yH5wKdpHDtgqWqUGpsO5w0EcElf7g90eYXF1RA/output-0.png', 'created_at': '2023-11-03T17:24:31.993569Z', 'description': 'Create illusions with img2img and masking support', 'github_url': 'https://github.com/fofr/cog-illusion', 'license_url': None, 'name': 'illusions', 'owner': 'fofr', 'paper_url': None, 'run_count': 4709, 'url': 'https://replicate.com/fofr/illusions', 'visibility': 'public', 'hardware': 'Nvidia A40 (Large) GPU'}
    @classmethod
    def return_type(cls): return ImageRef


    seed: int | None = Field(title='Seed', default=None)
    image: ImageRef = Field(default=ImageRef(), description='Optional img2img')
    width: int = Field(title='Width', default=768)
    height: int = Field(title='Height', default=768)
    prompt: str = Field(title='Prompt', default='a painting of a 19th century town')
    mask_image: ImageRef = Field(default=ImageRef(), description='Optional mask for inpainting')
    num_outputs: int = Field(title='Num Outputs', description='Number of outputs', default=1)
    control_image: ImageRef = Field(default=ImageRef(), description='Control image')
    controlnet_end: float = Field(title='Controlnet End', description='When controlnet conditioning ends', default=1.0)
    guidance_scale: float = Field(title='Guidance Scale', description='Scale for classifier-free guidance', default=7.5)
    negative_prompt: str = Field(title='Negative Prompt', description='The negative prompt to guide image generation.', default='ugly, disfigured, low quality, blurry, nsfw')
    prompt_strength: float = Field(title='Prompt Strength', description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image', default=0.8)
    sizing_strategy: Sizing_strategy = Field(description='Decide how to resize images – use width/height, resize based on input image or control image', default='width/height')
    controlnet_start: float = Field(title='Controlnet Start', description='When controlnet conditioning starts', default=0.0)
    num_inference_steps: int = Field(title='Num Inference Steps', description='Number of diffusion steps', default=40)
    controlnet_conditioning_scale: float = Field(title='Controlnet Conditioning Scale', description='How strong the controlnet conditioning is', default=0.75)