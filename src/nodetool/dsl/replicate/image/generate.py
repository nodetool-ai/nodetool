from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class AdInpaint(GraphNode):
    """Product advertising image generator"""

    Pixel: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.AdInpaint.Pixel
    Product_size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.AdInpaint.Product_size
    pixel: nodetool.nodes.replicate.image.generate.AdInpaint.Pixel = Field(default=Pixel._512___512, description='image total pixel')
    scale: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Factor to scale image by (maximum: 4)')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Product name or prompt')
    image_num: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of image to generate')
    image_path: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='input image')
    manual_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Manual Seed')
    product_size: nodetool.nodes.replicate.image.generate.AdInpaint.Product_size = Field(default=Product_size.ORIGINAL, description='Max product size')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description="Anything you don't want in the photo")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Inference Steps')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.AdInpaint"


import nodetool.nodes.replicate.image.generate

class ConsistentCharacter(GraphNode):
    """Create images of a given character in different poses"""

    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.ConsistentCharacter.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A headshot photo', description='Describe the subject. Include clothes and hairstyle for more consistency.')
    subject: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An image of a person. Best images are square close ups of a face, but they do not have to be.')
    output_format: nodetool.nodes.replicate.image.generate.ConsistentCharacter.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    randomise_poses: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Randomise the poses used.')
    number_of_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='The number of images to generate.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')
    number_of_images_per_pose: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate for each pose.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.ConsistentCharacter"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_1_1_Pro_Ultra(GraphNode):
    """FLUX1.1 [pro] in ultra and raw modes. Images are up to 4 megapixels. Use raw mode for realism."""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_1_1_Pro_Ultra.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_1_1_Pro_Ultra.Output_format
    raw: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Generate less processed, more natural-looking images')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_1_1_Pro_Ultra.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    image_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_1_1_Pro_Ultra.Output_format = Field(default=Output_format.JPG, description='Format of the output images.')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance, 1 is most strict and 6 is most permissive')
    image_prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Blend between the prompt and the image prompt.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_1_1_Pro_Ultra"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_360(GraphNode):
    """Generate 360 panorama images."""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_360.Model
    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_360.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_360.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_360.Output_format
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    model: nodetool.nodes.replicate.image.generate.Flux_360.Model = Field(default=Model.DEV, description='Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps.')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image.')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    extra_lora: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_360.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_360.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode')
    output_format: nodetool.nodes.replicate.image.generate.Flux_360.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    extra_lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. More steps can give more detailed images, but take longer.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_360"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Black_Light(GraphNode):
    """A flux lora fine-tuned on black light images"""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Black_Light.Model
    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Black_Light.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Black_Light.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Black_Light.Output_format
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    model: nodetool.nodes.replicate.image.generate.Flux_Black_Light.Model = Field(default=Model.DEV, description='Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps.')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image.')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    extra_lora: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Black_Light.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Black_Light.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Black_Light.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    extra_lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. More steps can give more detailed images, but take longer.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Black_Light"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Canny_Dev(GraphNode):
    """Open-weight edge-guided image generation. Control structure and composition using Canny edge detection."""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Canny_Dev.Megapixels
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Canny_Dev.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Guidance for generated image')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Canny_Dev.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image used to control the generation. The canny edge detection will be automatically generated.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Canny_Dev.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Canny_Dev"


import nodetool.nodes.replicate.image.generate

class Flux_Canny_Pro(GraphNode):
    """Professional edge-guided image generation. Control structure and composition using Canny edge detection"""

    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Canny_Pro.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of diffusion steps. Higher values yield finer details but increase processing time.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to use as control input. Must be jpeg, png, gif, or webp.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Canny_Pro.Output_format = Field(default=Output_format.JPG, description='Format of the output images.')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance, 1 is most strict and 6 is most permissive')
    prompt_upsampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Automatically modify the prompt for more creative generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Canny_Pro"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Cinestill(GraphNode):
    """Flux lora, use "CNSTLL" to trigger"""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Cinestill.Model
    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Cinestill.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Cinestill.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Cinestill.Output_format
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    model: nodetool.nodes.replicate.image.generate.Flux_Cinestill.Model = Field(default=Model.DEV, description='Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps.')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image.')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    extra_lora: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Cinestill.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Cinestill.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Cinestill.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    extra_lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. More steps can give more detailed images, but take longer.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Cinestill"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Depth_Dev(GraphNode):
    """Open-weight depth-aware image generation. Edit images while preserving spatial relationships."""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Depth_Dev.Megapixels
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Depth_Dev.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Guidance for generated image')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Depth_Dev.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image used to control the generation. The depth map will be automatically generated.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Depth_Dev.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Depth_Dev"


import nodetool.nodes.replicate.image.generate

class Flux_Depth_Pro(GraphNode):
    """Professional depth-aware image generation. Edit images while preserving spatial relationships."""

    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Depth_Pro.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of diffusion steps. Higher values yield finer details but increase processing time.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to use as control input. Must be jpeg, png, gif, or webp.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Depth_Pro.Output_format = Field(default=Output_format.JPG, description='Format of the output images.')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance, 1 is most strict and 6 is most permissive')
    prompt_upsampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Automatically modify the prompt for more creative generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Depth_Pro"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Dev(GraphNode):
    """A 12 billion parameter rectified flow transformer capable of generating images from text descriptions"""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image for image to image mode. The aspect ratio of your output will match this image')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance for generated image')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Dev.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Dev.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Dev.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Dev"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Dev_Lora(GraphNode):
    """A version of flux-dev, a text to image model, that supports fast fine-tuned lora inference"""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image mode. The aspect ratio of your output will match this image')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance for generated image')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    output_format: nodetool.nodes.replicate.image.generate.Flux_Dev_Lora.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Dev_Lora"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Fill_Dev(GraphNode):
    """Open-weight inpainting model for editing and extending images. Guidance-distilled from FLUX.1 Fill [pro]."""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Fill_Dev.Megapixels
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Fill_Dev.Output_format
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="The image to inpaint. Can contain alpha mask. If the image width or height are not multiples of 32, they will be scaled to the closest multiple of 32. If the image dimensions don't fit within 1440x1440, it will be scaled down to fit.")
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Guidance for generated image')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Fill_Dev.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels)')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Fill_Dev.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Fill_Dev"


import nodetool.nodes.replicate.image.generate

class Flux_Fill_Pro(GraphNode):
    """Professional inpainting and outpainting model with state-of-the-art performance. Edit or extend images with natural, seamless results."""

    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Fill_Pro.Output_format
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted. Must have the same size as image. Optional if you provide an alpha mask in the original image. Must be jpeg, png, gif, or webp.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The image to inpaint. Can contain an alpha mask. Must be jpeg, png, gif, or webp.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of diffusion steps. Higher values yield finer details but increase processing time.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Fill_Pro.Output_format = Field(default=Output_format.JPG, description='Format of the output images.')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance, 1 is most strict and 6 is most permissive')
    prompt_upsampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Automatically modify the prompt for more creative generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Fill_Pro"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Mona_Lisa(GraphNode):
    """Flux lora, use the term "MNALSA" to trigger generation"""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Model
    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Output_format
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored.')
    model: nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Model = Field(default=Model.DEV, description='Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps.')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image.')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    extra_lora: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Mona_Lisa.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image')
    extra_lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    replicate_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. More steps can give more detailed images, but take longer.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Mona_Lisa"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Pro(GraphNode):
    """State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity."""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Pro.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Pro.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of diffusion steps')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes.")
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes.")
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt.')
    interval: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Interval is a setting that increases the variance in possible outputs letting the model be a tad more dynamic in what outputs it may produce in terms of composition, color, detail, and prompt interpretation. Setting this value low will ensure strong prompt following with more consistent outputs, setting it higher will produce more dynamic or varied outputs.')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Pro.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    image_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp.')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Pro.Output_format = Field(default=Output_format.WEBP, description='Format of the output images.')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance, 1 is most strict and 6 is most permissive')
    prompt_upsampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Automatically modify the prompt for more creative generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Pro"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Redux_Dev(GraphNode):
    """Open-weight image variation model. Create new versions while preserving key elements of your original."""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Guidance for generated image')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    redux_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to condition your output on. This replaces prompt for FLUX.1 Redux models')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Redux_Dev.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='Number of denoising steps. Recommended range is 28-50')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Redux_Dev"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Redux_Schnell(GraphNode):
    """Fast, efficient image variation model for rapid iteration and experimentation."""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    redux_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to condition your output on. This replaces prompt for FLUX.1 Redux models')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Redux_Schnell.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Redux_Schnell"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Schnell(GraphNode):
    """The fastest image generation model tailored for local development and personal use"""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Schnell.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Schnell.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    output_format: nodetool.nodes.replicate.image.generate.Flux_Schnell.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Schnell"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Flux_Schnell_Lora(GraphNode):
    """The fastest image generation model tailored for fine-tuned use"""

    Megapixels: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Megapixels
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    go_fast: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora.")
    megapixels: nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Megapixels = Field(default=Megapixels._1, description='Approximate number of megapixels for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs to generate')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio for the generated image')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars'")
    output_format: nodetool.nodes.replicate.image.generate.Flux_Schnell_Lora.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Flux_Schnell_Lora"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Hyper_Flux_8Step(GraphNode):
    """Hyper FLUX 8-step by ByteDance"""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Hyper_Flux_8Step.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Hyper_Flux_8Step.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    width: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Width of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)")
    height: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Height of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16)")
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for generated image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Hyper_Flux_8Step.Aspect_ratio = Field(default=Aspect_ratio._1_1, description="Aspect ratio for the generated image. The size will always be 1 megapixel, i.e. 1024x1024 if aspect ratio is 1:1. To use arbitrary width and height, set aspect ratio to 'custom'.")
    output_format: nodetool.nodes.replicate.image.generate.Hyper_Flux_8Step.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='Guidance scale for the diffusion process')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Number of inference steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Hyper_Flux_8Step"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Ideogram_V2(GraphNode):
    """An excellent image model with state of the art inpainting, prompt comprehension and text rendering"""

    Resolution: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2.Resolution
    Style_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2.Style_type
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2.Aspect_ratio
    Magic_prompt_option: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2.Magic_prompt_option
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An image file to use for inpainting.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    resolution: nodetool.nodes.replicate.image.generate.Ideogram_V2.Resolution = Field(default=Resolution.NONE, description='Resolution. Overrides aspect ratio. Ignored if an inpainting image is given.')
    style_type: nodetool.nodes.replicate.image.generate.Ideogram_V2.Style_type = Field(default=Style_type.NONE, description='The styles help define the specific aesthetic of the image you want to generate.')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Ideogram_V2.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio. Ignored if a resolution or inpainting image is given.')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Things you do not want to see in the generated image.')
    magic_prompt_option: nodetool.nodes.replicate.image.generate.Ideogram_V2.Magic_prompt_option = Field(default=Magic_prompt_option.AUTO, description='Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Ideogram_V2"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Ideogram_V2_Turbo(GraphNode):
    """A fast image model with state of the art inpainting, prompt comprehension and text rendering."""

    Resolution: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Resolution
    Style_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Style_type
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Aspect_ratio
    Magic_prompt_option: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Magic_prompt_option
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An image file to use for inpainting.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    resolution: nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Resolution = Field(default=Resolution.NONE, description='Resolution. Overrides aspect ratio. Ignored if an inpainting image is given.')
    style_type: nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Style_type = Field(default=Style_type.NONE, description='The styles help define the specific aesthetic of the image you want to generate.')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='Aspect ratio. Ignored if a resolution or inpainting image is given.')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Things you do not want to see in the generated image.')
    magic_prompt_option: nodetool.nodes.replicate.image.generate.Ideogram_V2_Turbo.Magic_prompt_option = Field(default=Magic_prompt_option.AUTO, description='Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Ideogram_V2_Turbo"


import nodetool.nodes.replicate.image.generate

class Illusions(GraphNode):
    """Create illusions with img2img and masking support"""

    Sizing_strategy: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Illusions.Sizing_strategy
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Optional img2img')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a painting of a 19th century town', description=None)
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Optional mask for inpainting')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of outputs')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Control image')
    controlnet_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='When controlnet conditioning ends')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='ugly, disfigured, low quality, blurry, nsfw', description='The negative prompt to guide image generation.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    sizing_strategy: nodetool.nodes.replicate.image.generate.Illusions.Sizing_strategy = Field(default=Sizing_strategy.WIDTH_HEIGHT, description='Decide how to resize images – use width/height, resize based on input image or control image')
    controlnet_start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='When controlnet conditioning starts')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Number of diffusion steps')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the controlnet conditioning is')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Illusions"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Kandinsky(GraphNode):
    """multilingual text2image latent diffusion model"""

    Width: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky.Width
    Height: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky.Height
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: nodetool.nodes.replicate.image.generate.Kandinsky.Width = Field(default=Width._512, description='Width of output image. Lower the setting if hits memory limits.')
    height: nodetool.nodes.replicate.image.generate.Kandinsky.Height = Field(default=Height._512, description='Height of output image. Lower the setting if hits memory limits.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A moss covered astronaut with a black background', description='Input prompt')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    output_format: nodetool.nodes.replicate.image.generate.Kandinsky.Output_format = Field(default=Output_format.WEBP, description='Output image format')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=75, description='Number of denoising steps')
    num_inference_steps_prior: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps for priors')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Kandinsky"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Kandinsky_2_2(GraphNode):
    """multilingual text2image latent diffusion model"""

    Width: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Width
    Height: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Height
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Width = Field(default=Width._512, description='Width of output image. Lower the setting if hits memory limits.')
    height: nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Height = Field(default=Height._512, description='Height of output image. Lower the setting if hits memory limits.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A moss covered astronaut with a black background', description='Input prompt')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    output_format: nodetool.nodes.replicate.image.generate.Kandinsky_2_2.Output_format = Field(default=Output_format.WEBP, description='Output image format')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=75, description='Number of denoising steps')
    num_inference_steps_prior: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps for priors')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Kandinsky_2_2"


import nodetool.nodes.replicate.image.generate

class Photon_Flash(GraphNode):
    """Accelerated variant of Photon prioritizing speed while maintaining quality"""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Photon_Flash.Aspect_ratio
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Set for reproducible generation')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    aspect_ratio: nodetool.nodes.replicate.image.generate.Photon_Flash.Aspect_ratio = Field(default=Aspect_ratio._16_9, description='Aspect ratio of the generated image')
    image_reference_url: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='URL of a reference image to guide generation')
    style_reference_url: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='URL of a style reference image')
    image_reference_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Weight of the reference image. Larger values will make the reference image have a stronger influence on the generated image.')
    style_reference_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Weight of the style reference image')
    character_reference_url: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='URL of a character reference image')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Photon_Flash"


import nodetool.nodes.replicate.image.generate

class PlaygroundV2(GraphNode):
    """Playground v2.5 is the state-of-the-art open-source model in aesthetic quality"""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.PlaygroundV2.Scheduler
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Astronaut in a jungle, cold color palette, muted colors, detailed, 8k', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.PlaygroundV2.Scheduler = Field(default=Scheduler.DPMSOLVER, description='Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Scale for classifier-free guidance')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='ugly, deformed, noisy, blurry, distorted', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.PlaygroundV2"


import nodetool.nodes.replicate.image.generate

class Proteus_V_02(GraphNode):
    """Proteus v0.2 shows subtle yet significant improvements over Version 0.1. It demonstrates enhanced prompt understanding that surpasses MJ6, while also approaching its stylistic capabilities."""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Proteus_V_02.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.Proteus_V_02.Scheduler = Field(default=Scheduler.KARRASDPM, description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance. Recommended 7-8')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='worst quality, low quality', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps. 20 to 35 steps for more detail, 20 steps for faster results.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Proteus_V_02"


import nodetool.nodes.replicate.image.generate

class Proteus_V_03(GraphNode):
    """ProteusV0.3: The Anime Update"""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Proteus_V_03.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Anime full body portrait of a swordsman holding his weapon in front of him. He is facing the camera with a fierce look on his face. Anime key visual (best quality, HD, ~+~aesthetic~+~:1.2)', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.Proteus_V_03.Scheduler = Field(default=Scheduler.DPM__2MSDE, description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance. Recommended 7-8')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='worst quality, low quality', description='Negative Input prompt')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Proteus_V_03"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class PulidBase(GraphNode):
    """Use a face to make images. Uses SDXL fine-tuned checkpoints."""

    Face_style: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.PulidBase.Face_style
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.PulidBase.Output_format
    Checkpoint_model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.PulidBase.Checkpoint_model
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the output image (ignored if structure image given)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the output image (ignored if structure image given)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A photo of a person', description='You might need to include a gender in the prompt to get the desired result')
    face_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The face image to use for the generation')
    face_style: nodetool.nodes.replicate.image.generate.PulidBase.Face_style = Field(default=Face_style.HIGH_FIDELITY, description='Style of the face')
    output_format: nodetool.nodes.replicate.image.generate.PulidBase.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    checkpoint_model: nodetool.nodes.replicate.image.generate.PulidBase.Checkpoint_model = Field(default=Checkpoint_model.GENERAL___DREAMSHAPERXL_ALPHA2XL10, description='Model to use for the generation')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.PulidBase"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Recraft_20B(GraphNode):
    """Affordable and fast images"""

    Size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_20B.Size
    Style: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_20B.Style
    size: nodetool.nodes.replicate.image.generate.Recraft_20B.Size = Field(default=Size._1024X1024, description='Width and height of the generated image')
    style: nodetool.nodes.replicate.image.generate.Recraft_20B.Style = Field(default=Style.REALISTIC_IMAGE, description='Style of the generated image.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Recraft_20B"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Recraft_20B_SVG(GraphNode):
    """Affordable and fast vector images"""

    Size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_20B_SVG.Size
    Style: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_20B_SVG.Style
    size: nodetool.nodes.replicate.image.generate.Recraft_20B_SVG.Size = Field(default=Size._1024X1024, description='Width and height of the generated image')
    style: nodetool.nodes.replicate.image.generate.Recraft_20B_SVG.Style = Field(default=Style.VECTOR_ILLUSTRATION, description='Style of the generated image.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Recraft_20B_SVG"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Recraft_V3(GraphNode):
    """Recraft V3 (code-named red_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis"""

    Size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_V3.Size
    Style: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_V3.Style
    size: nodetool.nodes.replicate.image.generate.Recraft_V3.Size = Field(default=Size._1024X1024, description='Width and height of the generated image')
    style: nodetool.nodes.replicate.image.generate.Recraft_V3.Style = Field(default=Style.ANY, description='Style of the generated image.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Recraft_V3"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class Recraft_V3_SVG(GraphNode):
    """Recraft V3 SVG (code-named red_panda) is a text-to-image model with the ability to generate high quality SVG images including logotypes, and icons. The model supports a wide list of styles."""

    Size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_V3_SVG.Size
    Style: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.Recraft_V3_SVG.Style
    size: nodetool.nodes.replicate.image.generate.Recraft_V3_SVG.Size = Field(default=Size._1024X1024, description='Width and height of the generated image')
    style: nodetool.nodes.replicate.image.generate.Recraft_V3_SVG.Style = Field(default=Style.ANY, description='Style of the generated image.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.Recraft_V3_SVG"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class SDXL_Ad_Inpaint(GraphNode):
    """Product advertising image generator using SDXL"""

    Img_size: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Img_size
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Scheduler
    Product_fill: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Product_fill
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Empty or 0 for a random image')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Remove background from this image')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Describe the new setting for your product')
    img_size: nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Img_size = Field(default=Img_size._1024__1024, description='Possible SDXL image sizes')
    apply_img: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies the original product image to the final result')
    scheduler: nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
    product_fill: nodetool.nodes.replicate.image.generate.SDXL_Ad_Inpaint.Product_fill = Field(default=Product_fill.ORIGINAL, description='What percentage of the image width to fill with product')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, out of frame, illustration, 3d, sepia, painting, cartoons, sketch, watermark, text, Logo, advertisement', description='Describe what you do not want in your setting')
    num_refine_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of steps to refine')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Inference Steps')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Ad_Inpaint"



class SDXL_Controlnet(GraphNode):
    """SDXL ControlNet - Canny"""

    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random seed. Set to 0 to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='aerial view, a futuristic research complex in a bright foggy jungle, hard lighting', description='Input prompt')
    condition_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='controlnet conditioning scale for generalization')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, bad quality, sketches', description='Input Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.SDXL_Controlnet"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class SDXL_Emoji(GraphNode):
    """An SDXL fine-tune based on Apple Emojis"""

    Refine: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Emoji.Refine
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Emoji.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: nodetool.nodes.replicate.image.generate.SDXL_Emoji.Refine = Field(default=Refine.NO_REFINER, description='Which refine style to use')
    scheduler: nodetool.nodes.replicate.image.generate.SDXL_Emoji.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
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
    def get_node_type(cls): return "replicate.image.generate.SDXL_Emoji"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class SDXL_Pixar(GraphNode):
    """Create Pixar poster easily with SDXL Pixar."""

    Refine: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Pixar.Refine
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.SDXL_Pixar.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: nodetool.nodes.replicate.image.generate.SDXL_Pixar.Refine = Field(default=Refine.NO_REFINER, description='Which refine style to use')
    scheduler: nodetool.nodes.replicate.image.generate.SDXL_Pixar.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
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
    def get_node_type(cls): return "replicate.image.generate.SDXL_Pixar"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusion(GraphNode):
    """A latent text-to-image diffusion model capable of generating photo-realistic images given any text input"""

    Width: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion.Width
    Height: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion.Height
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion.Scheduler
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: nodetool.nodes.replicate.image.generate.StableDiffusion.Width = Field(default=Width._768, description='Width of generated image in pixels. Needs to be a multiple of 64')
    height: nodetool.nodes.replicate.image.generate.StableDiffusion.Height = Field(default=Height._768, description='Height of generated image in pixels. Needs to be a multiple of 64')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a vision of paradise. unreal engine', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.StableDiffusion.Scheduler = Field(default=Scheduler.DPMSOLVERMULTISTEP, description='Choose a scheduler.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusion3_5_Large(GraphNode):
    """A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, thanks to Query-Key Normalization."""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large.Output_format
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The guidance scale tells the model how similar the output should be to the prompt.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image mode. The aspect ratio of your output will match this image.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=35, description='Number of steps to run the sampler for.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text prompt for image generation')
    aspect_ratio: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='The aspect ratio of your output image. This value is ignored if you are using an input image.')
    output_format: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=90, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion3_5_Large"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusion3_5_Large_Turbo(GraphNode):
    """A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, with a focus on fewer inference steps"""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large_Turbo.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large_Turbo.Output_format
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The guidance scale tells the model how similar the output should be to the prompt.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image mode. The aspect ratio of your output will match this image.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of steps to run the sampler for.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text prompt for image generation')
    aspect_ratio: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large_Turbo.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='The aspect ratio of your output image. This value is ignored if you are using an input image.')
    output_format: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Large_Turbo.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=90, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion3_5_Large_Turbo"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusion3_5_Medium(GraphNode):
    """2.5 billion parameter image model with improved MMDiT-X architecture"""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Medium.Aspect_ratio
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Medium.Output_format
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=5, description='The guidance scale tells the model how similar the output should be to the prompt.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for image to image mode. The aspect ratio of your output will match this image.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Number of steps to run the sampler for.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text prompt for image generation')
    aspect_ratio: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Medium.Aspect_ratio = Field(default=Aspect_ratio._1_1, description='The aspect ratio of your output image. This value is ignored if you are using an input image.')
    output_format: nodetool.nodes.replicate.image.generate.StableDiffusion3_5_Medium.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=90, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image.')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusion3_5_Medium"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusionInpainting(GraphNode):
    """Fill in masked parts of images with Stable Diffusion"""

    Width: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Width
    Height: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Height
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Black and white image to use as mask for inpainting over the image provided. White pixels are inpainted and black pixels are preserved.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Initial image to generate variations of. Will be resized to height x width')
    width: nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Width = Field(default=Width._512, description='Width of generated image in pixels. Needs to be a multiple of 64')
    height: nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Height = Field(default=Height._512, description='Height of generated image in pixels. Needs to be a multiple of 64')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a vision of paradise. unreal engine', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.StableDiffusionInpainting.Scheduler = Field(default=Scheduler.DPMSOLVERMULTISTEP, description='Choose a scheduler.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specify things to not see in the output')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionInpainting"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StableDiffusionXL(GraphNode):
    """A text-to-image generative AI model that creates beautiful images"""

    Refine: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionXL.Refine
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionXL.Scheduler
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    refine: nodetool.nodes.replicate.image.generate.StableDiffusionXL.Refine = Field(default=Refine.NO_REFINER, description='Which refine style to use')
    scheduler: nodetool.nodes.replicate.image.generate.StableDiffusionXL.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
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
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety)')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXL"


import nodetool.nodes.replicate.image.generate

class StableDiffusionXLLightning(GraphNode):
    """SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps"""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StableDiffusionXLLightning.Scheduler
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of output image. Recommended 1024 or 1280')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of output image. Recommended 1024 or 1280')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='self-portrait of a woman, lightning in the background', description='Input prompt')
    scheduler: nodetool.nodes.replicate.image.generate.StableDiffusionXLLightning.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='worst quality, low quality', description='Negative Input prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of denoising steps. 4 for best results')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StableDiffusionXLLightning"


import nodetool.nodes.replicate.image.generate

class StickerMaker(GraphNode):
    """Make stickers with AI. Generates graphics with transparent backgrounds."""

    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StickerMaker.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Fix the random seed for reproducibility')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=17, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1152, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1152, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a cute cat', description=None)
    output_format: nodetool.nodes.replicate.image.generate.StickerMaker.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=90, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want in the image')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StickerMaker"


import nodetool.nodes.replicate.image.generate
import nodetool.nodes.replicate.image.generate

class StyleTransfer(GraphNode):
    """Transfer the style of one image to another"""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StyleTransfer.Model
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.generate.StyleTransfer.Output_format
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    model: nodetool.nodes.replicate.image.generate.StyleTransfer.Model = Field(default=Model.FAST, description='Model to use for the generation')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the output image (ignored if structure image given)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the output image (ignored if structure image given)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a unicorn', description='Prompt for the image')
    style_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Copy the style from this image')
    output_format: nodetool.nodes.replicate.image.generate.StyleTransfer.Output_format = Field(default=Output_format.WEBP, description='Format of the output images')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your image')
    structure_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An optional image to copy structure from. Output images will use the same aspect ratio.')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    structure_depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Strength of the depth controlnet')
    structure_denoising_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.65, description='How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance)')

    @classmethod
    def get_node_type(cls): return "replicate.image.generate.StyleTransfer"


