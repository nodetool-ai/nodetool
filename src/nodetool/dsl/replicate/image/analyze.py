from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.image.analyze

class Blip(GraphNode):
    """Generate image captions"""

    Task: typing.ClassVar[type] = nodetool.nodes.replicate.image.analyze.Blip.Task
    task: nodetool.nodes.replicate.image.analyze.Blip.Task = Field(default=Task.IMAGE_CAPTIONING, description='Choose a task.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    caption: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Type caption for the input image for image text matching task.')
    question: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Type question for the input image for visual question answering task.')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Blip"



class Blip2(GraphNode):
    """Answers questions about images"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to query or caption')
    caption: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Select if you want to generate image captions instead of asking questions')
    context: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional - previous questions and answers to be used as context for answering current question')
    question: str | GraphNode | tuple[GraphNode, str] = Field(default='What is this a picture of?', description='Question to ask about this image. Leave blank for captioning')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Temperature for use with nucleus sampling')
    use_nucleus_sampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Toggles the model using nucleus sampling to generate responses')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Blip2"



class ClipFeatures(GraphNode):
    """Return CLIP features for the clip-vit-large-patch14 model"""

    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='a\nb', description='Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.ClipFeatures"


import nodetool.nodes.replicate.image.analyze
import nodetool.nodes.replicate.image.analyze

class ClipInterrogator(GraphNode):
    """The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!"""

    Mode: typing.ClassVar[type] = nodetool.nodes.replicate.image.analyze.ClipInterrogator.Mode
    Clip_model_name: typing.ClassVar[type] = nodetool.nodes.replicate.image.analyze.ClipInterrogator.Clip_model_name
    mode: nodetool.nodes.replicate.image.analyze.ClipInterrogator.Mode = Field(default=Mode.BEST, description='Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds).')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    clip_model_name: nodetool.nodes.replicate.image.analyze.ClipInterrogator.Clip_model_name = Field(default=Clip_model_name.VIT_L_14_OPENAI, description='Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL.')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.ClipInterrogator"



class Img2Prompt(GraphNode):
    """Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Img2Prompt"



class Llava13b(GraphNode):
    """Visual instruction tuning towards large language and vision models with GPT-4 level capabilities"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt to use for text generation')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Maximum number of tokens to generate. A word is generally 2-3 tokens')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Llava13b"



class Moondream2(GraphNode):
    """moondream2 is a small vision language model designed to run efficiently on edge devices"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Describe this image', description='Input prompt')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Moondream2"



class NSFWImageDetection(GraphNode):
    """Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification"""

    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.NSFWImageDetection"


import nodetool.nodes.replicate.image.analyze

class SDXLClipInterrogator(GraphNode):
    """CLIP Interrogator for SDXL optimizes text prompts to match a given image"""

    Mode: typing.ClassVar[type] = nodetool.nodes.replicate.image.analyze.SDXLClipInterrogator.Mode
    mode: nodetool.nodes.replicate.image.analyze.SDXLClipInterrogator.Mode = Field(default=Mode.BEST, description='Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.SDXLClipInterrogator"


