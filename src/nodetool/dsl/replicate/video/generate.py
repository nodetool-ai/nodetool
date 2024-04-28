from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.video.generate import Base_model
from nodetool.nodes.replicate.video.generate import Output_format

class AnimateDiff(GraphNode):
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for different images and reproducibility. Use -1 to randomise seed')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width in pixels')
    frames: int | GraphNode | tuple[GraphNode, str] = Field(default=16, description='Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height in pixels')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='photo of vocano, rocks, storm weather, wind, lava waves, lightning, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3', description=None)
    base_model: Base_model | GraphNode | tuple[GraphNode, str] = Field(default='realisticVisionV20_v20', description='Select a base model (DreamBooth checkpoint)')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default='mp4', description="Output format of the video. Can be 'mp4' or 'gif'")
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale. How closely do we want to adhere to the prompt and its contents')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='blur, haze, deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, mutated hands and fingers, deformed, distorted, disfigured, poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, disconnected limbs, mutation, mutated, ugly, disgusting, amputation', description=None)
    pan_up_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Pan Up Motion LoRA. 0 disables the LoRA')
    zoom_in_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Zoom In Motion LoRA. 0 disables the LoRA')
    pan_down_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Pan Down Motion LoRA. 0 disables the LoRA')
    pan_left_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Pan Left Motion LoRA. 0 disables the LoRA')
    zoom_out_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Zoom Out Motion LoRA. 0 disables the LoRA')
    pan_right_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Pan Right Motion LoRA. 0 disables the LoRA')
    rolling_clockwise_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Rolling Clockwise Motion LoRA. 0 disables the LoRA')
    rolling_anticlockwise_motion_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Strength of Rolling Anticlockwise Motion LoRA. 0 disables the LoRA')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.AnimateDiff"



class AudioToWaveform(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='Audio file to create waveform from')
    bg_color: str | GraphNode | tuple[GraphNode, str] = Field(default='#000000', description='Background color of waveform')
    fg_alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='Opacity of foreground waveform')
    bar_count: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of bars in waveform')
    bar_width: float | GraphNode | tuple[GraphNode, str] = Field(default=0.4, description='Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc.')
    bars_color: str | GraphNode | tuple[GraphNode, str] = Field(default='#ffffff', description='Color of waveform bars')
    caption_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Caption text for the video')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.AudioToWaveform"


from nodetool.nodes.replicate.video.generate import Width
from nodetool.nodes.replicate.video.generate import Height
from nodetool.nodes.replicate.video.generate import Scheduler

class HotshotXL(GraphNode):
    mp4: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Save as mp4, False for GIF')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps')
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=672, description='Width of the output')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=384, description='Height of the output')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a camel smoking a cigarette, hd, high quality', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='EulerAncestralDiscreteScheduler', description='Select a Scheduler')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='blurry', description='Negative prompt')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.HotshotXL"


