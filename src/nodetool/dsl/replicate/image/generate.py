from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.image.generate import Pixel
from nodetool.nodes.replicate.image.generate import Product_size

class AdInpaint(GraphNode):
    pixel: Pixel | GraphNode | tuple[GraphNode, str] = Field(default='512 * 512', description='image total pixel')
    scale: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Factor to scale image by (maximum: 4)')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Product name or prompt')
    image_num: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of image to generate')
    image_path: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='input image')
    manual_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Manual Seed')
    product_size: Product_size | GraphNode | tuple[GraphNode, str] = Field(default='Original', description='Max product size')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description="Anything you don't want in the photo")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Inference Steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.AdInpaint"



class ControlnetRealisticVision(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Leave blank to randomize')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=' num_inference_steps')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(a tabby cat)+++, high resolution, sitting on a park bench', description=None)
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='control strength/weight')
    max_width: float | GraphNode | tuple[GraphNode, str] = Field(default=612, description='max width of mask/image')
    max_height: float | GraphNode | tuple[GraphNode, str] = Field(default=612, description='max height of mask/image')
    guidance_scale: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='guidance_scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck', description=None)
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.ControlnetRealisticVision"


from nodetool.nodes.replicate.image.generate import Sizing_strategy

class Illusions(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Optional img2img')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a painting of a 19th century town', description=None)
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Optional mask for inpainting')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Control image')
    controlnet_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='When controlnet conditioning ends')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='ugly, disfigured, low quality, blurry, nsfw', description='The negative prompt to guide image generation.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    sizing_strategy: Sizing_strategy | GraphNode | tuple[GraphNode, str] = Field(default='width/height', description='Decide how to resize images – use width/height, resize based on input image or control image')
    controlnet_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='When controlnet conditioning starts')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Number of diffusion steps')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Illusions"


from nodetool.nodes.replicate.image.generate import Scheduler

class Juggernaut_XL_V9(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='beautiful lady, (freckles), big smile, ruby eyes, short hair, dark makeup, hyperdetailed photography, soft light, head and shoulders portrait, cover', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DPM++SDE', description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='CGI, Unreal, Airbrushed, Digital', description='Input Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Juggernaut_XL_V9"


from nodetool.nodes.replicate.image.generate import Width
from nodetool.nodes.replicate.image.generate import Height
from nodetool.nodes.replicate.image.generate import Output_format

class Kandinsky(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of output image. Lower the setting if hits memory limits.')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of output image. Lower the setting if hits memory limits.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A moss covered astronaut with a black background', description='Input prompt')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default='webp', description='Output image format')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=75, description='Number of denoising steps')
    num_inference_steps_prior: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps for priors')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Kandinsky"


from nodetool.nodes.replicate.image.generate import Scheduler

class PlaygroundV2(GraphNode):
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Astronaut in a jungle, cold color palette, muted colors, detailed, 8k', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DPMSolver++', description='Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='ugly, deformed, noisy, blurry, distorted', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.PlaygroundV2"


from nodetool.nodes.replicate.image.generate import Scheduler

class Proteus(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DPM++2MSDE', description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance. Recommended 4-6')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Proteus"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Controlnet_1
from nodetool.nodes.replicate.image.generate import Controlnet_2
from nodetool.nodes.replicate.image.generate import Controlnet_3
from nodetool.nodes.replicate.image.generate import Sizing_strategy

class RealVisXLV3(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default='no_refiner', description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output')
    controlnet_1: Controlnet_1 | GraphNode | tuple[GraphNode, str] = Field(default='none', description='Controlnet')
    controlnet_2: Controlnet_2 | GraphNode | tuple[GraphNode, str] = Field(default='none', description='Controlnet')
    controlnet_3: Controlnet_3 | GraphNode | tuple[GraphNode, str] = Field(default='none', description='Controlnet')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    sizing_strategy: Sizing_strategy | GraphNode | tuple[GraphNode, str] = Field(default='width_height', description='Decide how to resize images – use width/height, resize based on input image or control image')
    controlnet_1_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_2_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_3_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_1_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for first controlnet')
    controlnet_1_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    controlnet_2_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for second controlnet')
    controlnet_2_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    controlnet_3_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for third controlnet')
    controlnet_3_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API.')
    controlnet_1_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    controlnet_2_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    controlnet_3_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.RealVisXLV3"


from nodetool.nodes.replicate.image.generate import Img_size
from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Product_fill

class SDXL_Ad_Inpaint(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Empty or 0 for a random image')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Remove background from this image')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Describe the new setting for your product')
    img_size: Img_size | GraphNode | tuple[GraphNode, str] = Field(default='1024, 1024', description='Possible SDXL image sizes')
    apply_img: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies the original product image to the final result')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    product_fill: Product_fill | GraphNode | tuple[GraphNode, str] = Field(default='Original', description='What percentage of the image width to fill with product')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description='Describe what you do not want in your setting')
    num_refine_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of steps to refine')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Inference Steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Ad_Inpaint"



class SDXL_Controlnet(GraphNode):
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random seed. Set to 0 to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='aerial view, a futuristic research complex in a bright foggy jungle, hard lighting', description='Input prompt')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, bad quality, sketches', description='Input Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Controlnet"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class SDXL_Emoji(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default='no_refiner', description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Emoji"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class SDXL_Pixar(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default='no_refiner', description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Pixar"


from nodetool.nodes.replicate.image.generate import Width
from nodetool.nodes.replicate.image.generate import Height
from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusion(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Width of generated image in pixels. Needs to be a multiple of 64')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Height of generated image in pixels. Needs to be a multiple of 64')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a vision of paradise. unreal engine', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DPMSolverMultistep', description='Choose a scheduler.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion"


from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionInpainting(GraphNode):
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Mask image - make sure it's the same size as the input image")
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='modern bed with beige sheet and pillows', description='Input prompt')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='1.0 corresponds to full destruction of information in image')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output. Higher number of outputs may OOM.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Guidance scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='monochrome, lowres, bad anatomy, worst quality, low quality', description='Input Negative Prompt')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionInpainting"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionXL(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default='no_refiner', description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXL"


from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionXLLightning(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A superhero smiling', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='K_EULER', description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Scale for classifier-free guidance. Recommended 7-8')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='worst quality, low quality', description='Negative Input prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 for best results')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXLLightning"


