from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.image.generate import Pixel
from nodetool.nodes.replicate.image.generate import Product_size

class AdInpaint(GraphNode):
    pixel: Pixel | GraphNode | tuple[GraphNode, str] = Field(default=Pixel('512 * 512'), description='image total pixel')
    scale: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Factor to scale image by (maximum: 4)')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Product name or prompt')
    image_num: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of image to generate')
    image_path: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='input image')
    manual_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Manual Seed')
    product_size: Product_size | GraphNode | tuple[GraphNode, str] = Field(default=Product_size('Original'), description='Max product size')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description="Anything you don't want in the photo")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Inference Steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.AdInpaint"


from nodetool.nodes.replicate.image.generate import Output_format

class ConsistentCharacter(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A headshot photo', description='Describe the subject. Include clothes and hairstyle for more consistency.')
    subject: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='An image of a person. Best images are square close ups of a face, but they do not have to be.')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    randomise_poses: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Randomise the poses used.')
    number_of_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='The number of images to generate.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')
    number_of_images_per_pose: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate for each pose.')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.ConsistentCharacter"



class Controlnet_Realistic_Vision(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Leave blank to randomize')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=' num_inference_steps')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(a tabby cat)+++, high resolution, sitting on a park bench', description=None)
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='control strength/weight')
    max_width: float | GraphNode | tuple[GraphNode, str] = Field(default=612, description='max width of mask/image')
    max_height: float | GraphNode | tuple[GraphNode, str] = Field(default=612, description='max height of mask/image')
    guidance_scale: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='guidance_scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck', description=None)
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Controlnet_Realistic_Vision"


from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Ip_adapter_ckpt

class Controlnet_X_IP_Adapter_Realistic_Vision_V5(GraphNode):
    eta: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Controls the amount of noise that is added to the input data during the denoising diffusion process. Higher value -> more noise')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt - using compel, use +++ to increase words weight:: doc: https://github.com/damian0815/compel/tree/main/doc || https://invoke-ai.github.io/InvokeAI/features/PROMPTS/#attention-weighting')
    max_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Max width/Resolution of image')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DDIM'), description='Choose a scheduler.')
    guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.')
    int_kwargs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='mask image for inpainting controlnet')
    max_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Max height/Resolution of image')
    tile_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image for tile controlnet')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    img2img_image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image2image image')
    lineart_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image for canny controlnet')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Scale for classifier-free guidance')
    scribble_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image for scribble controlnet')
    ip_adapter_ckpt: Ip_adapter_ckpt | GraphNode | tuple[GraphNode, str] = Field(default=Ip_adapter_ckpt('ip-adapter_sd15.bin'), description='IP Adapter checkpoint')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality', description='Negative prompt - using compel, use +++ to increase words weight//// negative-embeddings available ///// FastNegativeV2 , boring_e621_v4 , verybadimagenegative_v1 || to use them, write their keyword in negative prompt')
    brightness_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image for brightness controlnet')
    img2img_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='img2img strength, does not work when inpainting image is given, 0.1-same image, 0.99-complete destruction of image')
    inpainting_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image for inpainting controlnet')
    ip_adapter_image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='IP Adapter image')
    ip_adapter_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='IP Adapter weight')
    sorted_controlnets: str | GraphNode | tuple[GraphNode, str] = Field(default='lineart, tile, inpainting', description='Comma seperated string of controlnet names, list of names: tile, inpainting, lineart,depth ,scribble , brightness /// example value: tile, inpainting, lineart ')
    inpainting_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='inpainting strength')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps to run denoising')
    disable_safety_check: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety check. Use at your own risk!')
    film_grain_lora_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='disabled on 0')
    negative_auto_mask_text: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="// seperated list of objects you dont want to mask - 'hairs // eyes // cloth' ")
    positive_auto_mask_text: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="// seperated list of objects for mask, AI will auto create mask of these objects, if mask text is given, mask image will not work - 'hairs // eyes // cloth'")
    tile_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Conditioning scale for tile controlnet')
    add_more_detail_lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Scale/ weight of more_details lora, more scale = more details, disabled on 0')
    detail_tweaker_lora_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='disabled on 0')
    lineart_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Conditioning scale for canny controlnet')
    scribble_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Conditioning scale for scribble controlnet')
    epi_noise_offset_lora_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='disabled on 0')
    brightness_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Conditioning scale for brightness controlnet')
    inpainting_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Conditioning scale for inpaint controlnet')
    color_temprature_slider_lora_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='disabled on 0')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Controlnet_X_IP_Adapter_Realistic_Vision_V5"


from nodetool.nodes.replicate.image.generate import Output_format

class EpicRealismXL_Lightning_Hades(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.EpicRealismXL_Lightning_Hades"


from nodetool.nodes.replicate.image.generate import Sizing_strategy

class Illusions(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Optional img2img')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a painting of a 19th century town', description=None)
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Optional mask for inpainting')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Control image')
    controlnet_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='When controlnet conditioning ends')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='ugly, disfigured, low quality, blurry, nsfw', description='The negative prompt to guide image generation.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    sizing_strategy: Sizing_strategy | GraphNode | tuple[GraphNode, str] = Field(default=Sizing_strategy('width/height'), description='Decide how to resize images – use width/height, resize based on input image or control image')
    controlnet_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='When controlnet conditioning starts')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of diffusion steps')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Illusions"


from nodetool.nodes.replicate.image.generate import Scheduler

class Juggernaut_XL_V9(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='beautiful lady, (freckles), big smile, ruby eyes, short hair, dark makeup, hyperdetailed photography, soft light, head and shoulders portrait, cover', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DPM++SDE'), description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='CGI, Unreal, Airbrushed, Digital', description='Input Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Juggernaut_XL_V9"


from nodetool.nodes.replicate.image.generate import Width
from nodetool.nodes.replicate.image.generate import Height
from nodetool.nodes.replicate.image.generate import Output_format

class Kandinsky(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=Width(512), description='Width of output image. Lower the setting if hits memory limits.')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=Height(512), description='Height of output image. Lower the setting if hits memory limits.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A moss covered astronaut with a black background', description='Input prompt')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Output image format')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps')
    num_inference_steps_prior: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps for priors')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Kandinsky"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class OpenDalle_Lora(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default=Refine('no_refiner'), description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('KarrasDPM'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.OpenDalle_Lora"


from nodetool.nodes.replicate.image.generate import Scheduler

class PlaygroundV2(GraphNode):
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Astronaut in a jungle, cold color palette, muted colors, detailed, 8k', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DPMSolver++'), description='Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases')
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
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DPM++2MSDE'), description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance. Recommended 4-6')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='nsfw, bad quality, bad anatomy, worst quality, low quality, low resolutions, extra fingers, blur, blurry, ugly, wrongs proportions, watermark, image artifacts, lowres, ugly, jpeg artifacts, deformed, noisy image', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Proteus"


from nodetool.nodes.replicate.image.generate import Face_style
from nodetool.nodes.replicate.image.generate import Output_format
from nodetool.nodes.replicate.image.generate import Checkpoint_model

class PulidBase(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the output image (ignored if structure image given)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the output image (ignored if structure image given)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A photo of a person', description='You might need to include a gender in the prompt to get the desired result')
    face_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The face image to use for the generation')
    face_style: Face_style | GraphNode | tuple[GraphNode, str] = Field(default=Face_style('high-fidelity'), description='Style of the face')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    checkpoint_model: Checkpoint_model | GraphNode | tuple[GraphNode, str] = Field(default=Checkpoint_model('general - dreamshaperXL_alpha2Xl10'), description='Model to use for the generation')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.PulidBase"


from nodetool.nodes.replicate.image.generate import Scheduler

class RealVisXL2_LCM(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='dark shot, front shot, closeup photo of a 25 y.o latino man, perfect eyes, natural skin, skin moles, looks at viewer, cinematic shot', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('LCM'), description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.RealVisXL2_LCM"


from nodetool.nodes.replicate.image.generate import Scheduler

class RealVisXL_V2(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='dark shot, front shot, closeup photo of a 25 y.o latino man, perfect eyes, natural skin, skin moles, looks at viewer, cinematic shot', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DPMSolverMultistep'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.RealVisXL_V2"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Controlnet_1
from nodetool.nodes.replicate.image.generate import Controlnet_2
from nodetool.nodes.replicate.image.generate import Controlnet_3
from nodetool.nodes.replicate.image.generate import Sizing_strategy

class RealVisXL_V3_Multi_Controlnet_Lora(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default=Refine('no_refiner'), description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output')
    controlnet_1: Controlnet_1 | GraphNode | tuple[GraphNode, str] = Field(default=Controlnet_1('none'), description='Controlnet')
    controlnet_2: Controlnet_2 | GraphNode | tuple[GraphNode, str] = Field(default=Controlnet_2('none'), description='Controlnet')
    controlnet_3: Controlnet_3 | GraphNode | tuple[GraphNode, str] = Field(default=Controlnet_3('none'), description='Controlnet')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    sizing_strategy: Sizing_strategy | GraphNode | tuple[GraphNode, str] = Field(default=Sizing_strategy('width_height'), description='Decide how to resize images – use width/height, resize based on input image or control image')
    controlnet_1_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_2_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_3_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When controlnet conditioning ends')
    controlnet_1_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for first controlnet')
    controlnet_1_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    controlnet_2_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for second controlnet')
    controlnet_2_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    controlnet_3_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for third controlnet')
    controlnet_3_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When controlnet conditioning starts')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API.')
    controlnet_1_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    controlnet_2_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    controlnet_3_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.RealVisXL_V3_Multi_Controlnet_Lora"


from nodetool.nodes.replicate.image.generate import Model
from nodetool.nodes.replicate.image.generate import Sampler
from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Output_format

class SD3_Explorer(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('sd3_medium_incl_clips_t5xxlfp16.safetensors'), description='Pick whether to use T5-XXL in fp16, fp8 or not at all')
    shift: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='The timestep scheduling shift. Try values 6.0 and 2.0 to experiment with effects.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of steps to run the diffusion model for')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The width of the image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The height of the image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='This prompt is ignored when using the triple prompt mode. See below.')
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler('dpmpp_2m'), description='The sampler to use for the diffusion model')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('sgm_uniform'), description='The scheduler to use for the diffusion model')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.5, description='The guidance scale tells the model how similar the output should be to the prompt.')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Negative prompts do not really work in SD3. This will simply cause your output image to vary in unpredictable ways.')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    triple_prompt_t5: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt that will be passed to just the T5-XXL model.')
    use_triple_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    triple_prompt_clip_g: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt that will be passed to just the CLIP-G model.')
    triple_prompt_clip_l: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt that will be passed to just the CLIP-L model.')
    negative_conditioning_end: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='When the negative conditioning should stop being applied. By default it is disabled.')
    triple_prompt_empty_padding: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to add padding for empty prompts. Useful if you only want to pass a prompt to one or two of the three text encoders. Has no effect when all prompts are filled. Disable this for interesting effects.')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SD3_Explorer"


from nodetool.nodes.replicate.image.generate import Img_size
from nodetool.nodes.replicate.image.generate import Scheduler
from nodetool.nodes.replicate.image.generate import Product_fill

class SDXL_Ad_Inpaint(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Empty or 0 for a random image')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Remove background from this image')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Describe the new setting for your product')
    img_size: Img_size | GraphNode | tuple[GraphNode, str] = Field(default=Img_size('1024, 1024'), description='Possible SDXL image sizes')
    apply_img: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies the original product image to the final result')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    product_fill: Product_fill | GraphNode | tuple[GraphNode, str] = Field(default=Product_fill('Original'), description='What percentage of the image width to fill with product')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description='Describe what you do not want in your setting')
    num_refine_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of steps to refine')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Inference Steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Ad_Inpaint"



class SDXL_Controlnet(GraphNode):
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random seed. Set to 0 to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='aerial view, a futuristic research complex in a bright foggy jungle, hard lighting', description='Input prompt')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, bad quality, sketches', description='Input Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Controlnet"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class SDXL_Emoji(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default=Refine('no_refiner'), description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Emoji"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class SDXL_Pixar(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default=Refine('no_refiner'), description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Pixar"


from nodetool.nodes.replicate.image.generate import Width
from nodetool.nodes.replicate.image.generate import Height
from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusion(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=Width(768), description='Width of generated image in pixels. Needs to be a multiple of 64')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=Height(768), description='Height of generated image in pixels. Needs to be a multiple of 64')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a vision of paradise. unreal engine', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('DPMSolverMultistep'), description='Choose a scheduler.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion"


from nodetool.nodes.replicate.image.generate import Aspect_ratio
from nodetool.nodes.replicate.image.generate import Output_format

class StableDiffusion3(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image for img2img mode')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input prompt')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    aspect_ratio: Aspect_ratio | GraphNode | tuple[GraphNode, str] = Field(default=Aspect_ratio('1:1'), description='Aspect ratio for the generated image')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.5, description='Scale for classifier-free guidance')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input negative prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion3"


from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionInpainting(GraphNode):
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Mask image - make sure it's the same size as the input image")
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='modern bed with beige sheet and pillows', description='Input prompt')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='1.0 corresponds to full destruction of information in image')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output. Higher number of outputs may OOM.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Guidance scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='monochrome, lowres, bad anatomy, worst quality, low quality', description='Input Negative Prompt')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionInpainting"


from nodetool.nodes.replicate.image.generate import Refine
from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionXL(GraphNode):
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: Refine | GraphNode | tuple[GraphNode, str] = Field(default=Refine('no_refiner'), description='Which refine style to use')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    refine_steps: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='For base_image_refiner, the number of steps to refine, defaults to num_inference_steps')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    high_noise_frac: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='For expert_ensemble_refiner, the fraction of noise to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXL"


from nodetool.nodes.replicate.image.generate import Scheduler

class StableDiffusionXLLightning(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A superhero smiling', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('K_EULER'), description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Scale for classifier-free guidance. Recommended 7-8')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='worst quality, low quality', description='Negative Input prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 for best results')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXLLightning"


from nodetool.nodes.replicate.image.generate import Model
from nodetool.nodes.replicate.image.generate import Output_format

class StyleTransfer(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('fast'), description='Model to use for the generation')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the output image (ignored if structure image given)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the output image (ignored if structure image given)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a unicorn', description='Prompt for the image')
    style_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Copy the style from this image')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('webp'), description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    structure_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='An optional image to copy structure from. Output images will use the same aspect ratio.')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    structure_depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Strength of the depth controlnet')
    structure_denoising_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.65, description='How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance)')
    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StyleTransfer"


