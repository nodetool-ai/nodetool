from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AnimateDiffNode(GraphNode):
    """
    Generates animated GIFs using the AnimateDiff pipeline.
    image, animation, generation, AI

    Use cases:
    - Create animated visual content from text descriptions
    - Generate dynamic visual effects for creative projects
    - Produce animated illustrations for digital media
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='masterpiece, bestquality, highlydetailed, ultradetailed, sunset, orange sky, warm lighting, fishing boats, ocean waves seagulls, rippling water, wharf, silhouette, serene atmosphere, dusk, evening glow, golden hour, coastal landscape, seaside scenery', description='A text prompt describing the desired animation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='bad quality, worse quality', description="A text prompt describing what you don't want in the animation.")
    num_frames: int | GraphNode | tuple[GraphNode, str] = Field(default=16, description='The number of frames in the animation.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of denoising steps.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=42, description='Seed for the random number generator.')

    @classmethod
    def get_node_type(cls): return "huggingface.video.AnimateDiff"



class StableVideoDiffusion(GraphNode):
    """
    Generates a video from a single image using the Stable Video Diffusion model.
    video, generation, AI, image-to-video, stable-diffusion, SD

    Use cases:
    - Create short animations from static images
    - Generate dynamic content for presentations or social media
    - Prototype video ideas from still concept art
    """

    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to generate the video from, resized to 1024x576.')
    num_frames: int | GraphNode | tuple[GraphNode, str] = Field(default=14, description='Number of frames to generate.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of steps per generated frame')
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Frames per second for the output video.')
    decode_chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Number of frames to decode at once.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=42, description='Random seed for generation.')

    @classmethod
    def get_node_type(cls): return "huggingface.video.StableVideoDiffusion"


