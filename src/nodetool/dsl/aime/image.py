from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Flux(GraphNode):
    """
    Generate images using Flux through the Aime API.
    image generation, ai art, flux

    Use cases:
    - Generate high-quality images from text descriptions
    - Create artistic variations of prompts
    - Produce realistic or stylized imagery
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text prompt describing the desired image.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An image to use as a starting point for generation.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Random seed for generation. Use -1 for random seed.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps.')
    guidance: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='Guidance scale for generation.')
    image2image_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength of image-to-image transformation.')

    @classmethod
    def get_node_type(cls): return "aime.image.Flux"



class StableDiffusion3(GraphNode):
    """
    Generate images using Stable Diffusion 3 through the Aime API.
    image generation, ai art, stable diffusion

    Use cases:
    - Generate high-quality images from text descriptions
    - Create artistic variations of prompts
    - Produce realistic or stylized imagery
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text prompt describing the desired image.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='out of frame, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers', description='Text prompt describing elements to avoid in the image.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='An image to use as a starting point for generation.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Random seed for generation. Use -1 for random seed.')
    num_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate.')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps.')
    cfg_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Classifier free guidance scale.')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='Denoising strength.')

    @classmethod
    def get_node_type(cls): return "aime.image.StableDiffusion3"


