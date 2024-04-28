from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.image.analyze import Task

class Blip(GraphNode):
    task: Task | GraphNode | tuple[GraphNode, str] = Field(default='image_captioning', description='Choose a task.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    caption: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Type caption for the input image for image text matching task.')
    question: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Type question for the input image for visual question answering task.')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Blip"



class Blip2(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image to query or caption')
    caption: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Select if you want to generate image captions instead of asking questions')
    context: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional - previous questions and answers to be used as context for answering current question')
    question: str | GraphNode | tuple[GraphNode, str] = Field(default='What is this a picture of?', description='Question to ask about this image. Leave blank for captioning')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Temperature for use with nucleus sampling')
    use_nucleus_sampling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Toggles the model using nucleus sampling to generate responses')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Blip2"


from nodetool.nodes.replicate.image.analyze import Mode
from nodetool.nodes.replicate.image.analyze import Clip_model_name

class ClipInterrogator(GraphNode):
    mode: Mode | GraphNode | tuple[GraphNode, str] = Field(default='best', description='Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds).')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    clip_model_name: Clip_model_name | GraphNode | tuple[GraphNode, str] = Field(default='ViT-L-14/openai', description='Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL.')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.ClipInterrogator"



class Llava13b(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt to use for text generation')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Maximum number of tokens to generate. A word is generally 2-3 tokens')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Llava13b"



class Llava34B(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt to use for text generation')
    history: list | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Maximum number of tokens to generate. A word is generally 2-3 tokens')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Llava34B"



class MiniGPT4(GraphNode):
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image to discuss')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='Sample from the top p percent most likely tokens')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for mini-gpt4 regarding input image')
    num_beams: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Number of beams for beam search decoding')
    max_length: int | GraphNode | tuple[GraphNode, str] = Field(default=4000, description='Total length of prompt and output in tokens')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Temperature for generating tokens, lower = more predictable results')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=3000, description='Maximum number of new tokens to generate')
    repetition_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Penalty for repeated words in generated text; 1 is no penalty, values greater than 1 discourage repetition, less than 1 encourage it.')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.MiniGPT4"



class Moondream2(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Describe this image', description='Input prompt')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.Moondream2"



class NSFWImageDetection(GraphNode):
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.NSFWImageDetection"


from nodetool.nodes.replicate.image.analyze import Mode

class SDXLClipInterrogator(GraphNode):
    mode: Mode | GraphNode | tuple[GraphNode, str] = Field(default='best', description='Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.analyze.SDXLClipInterrogator"


