from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioToWaveform(GraphNode):
    """Create a waveform video from audio"""

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Audio file to create waveform from')
    bg_color: str | GraphNode | tuple[GraphNode, str] = Field(default='#000000', description='Background color of waveform')
    fg_alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='Opacity of foreground waveform')
    bar_count: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of bars in waveform')
    bar_width: float | GraphNode | tuple[GraphNode, str] = Field(default=0.4, description='Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc.')
    bars_color: str | GraphNode | tuple[GraphNode, str] = Field(default='#ffffff', description='Color of waveform bars')
    caption_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Caption text for the video')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.AudioToWaveform"


import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate

class HotshotXL(GraphNode):
    """😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL"""

    Width: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.HotshotXL.Width
    Height: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.HotshotXL.Height
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.HotshotXL.Scheduler
    mp4: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Save as mp4, False for GIF')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps')
    width: nodetool.nodes.replicate.video.generate.HotshotXL.Width = Field(default=Width._672, description='Width of the output')
    height: nodetool.nodes.replicate.video.generate.HotshotXL.Height = Field(default=Height._384, description='Height of the output')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a camel smoking a cigarette, hd, high quality', description='Input prompt')
    scheduler: nodetool.nodes.replicate.video.generate.HotshotXL.Scheduler = Field(default=Scheduler.EULERANCESTRALDISCRETESCHEDULER, description='Select a Scheduler')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='blurry', description='Negative prompt')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.HotshotXL"



class Hunyuan_Video(GraphNode):
    """A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions"""

    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Frames per second of the output video')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed (leave empty for random)')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=864, description='Width of the video in pixels (must be divisible by 16)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=480, description='Height of the video in pixels (must be divisible by 16)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A cat walks on the grass, realistic style', description='The prompt to guide the video generation')
    infer_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')
    video_length: int | GraphNode | tuple[GraphNode, str] = Field(default=129, description='Number of frames to generate (must be 4k+1, ex: 49 or 129)')
    embedded_guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Guidance scale')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Hunyuan_Video"


import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate

class LTX_Video(GraphNode):
    """LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched."""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.LTX_Video.Model
    Length: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.LTX_Video.Length
    Target_size: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.LTX_Video.Target_size
    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.LTX_Video.Aspect_ratio
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=3, description='How strongly the video follows the prompt')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Optional input image to use as the starting frame')
    model: nodetool.nodes.replicate.video.generate.LTX_Video.Model = Field(default=Model._0_9_1, description='Model version to use')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of steps')
    length: nodetool.nodes.replicate.video.generate.LTX_Video.Length = Field(default=Length._97, description='Length of the output video in frames')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='best quality, 4k, HDR, a tracking shot of a beautiful scene', description="Text prompt for the video. This model needs long descriptive prompts, if the prompt is too short the quality won't be good.")
    target_size: nodetool.nodes.replicate.video.generate.LTX_Video.Target_size = Field(default=Target_size._640, description='Target size for the output video')
    aspect_ratio: nodetool.nodes.replicate.video.generate.LTX_Video.Aspect_ratio = Field(default=Aspect_ratio._3_2, description='Aspect ratio of the output video. Ignored if an image is provided.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, worst quality, deformed, distorted', description='Things you do not want to see in your video')
    image_noise_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='Lower numbers stick more closely to the input image')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.LTX_Video"


import nodetool.nodes.replicate.video.generate
import nodetool.nodes.replicate.video.generate

class Music_01(GraphNode):
    """Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track"""

    Bitrate: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.Music_01.Bitrate
    Sample_rate: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.Music_01.Sample_rate
    lyrics: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment.')
    bitrate: nodetool.nodes.replicate.video.generate.Music_01.Bitrate = Field(default=Bitrate._256000, description='Bitrate for the generated music')
    voice_id: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Reuse a previously uploaded voice ID')
    song_file: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds.')
    voice_file: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Voice reference. Must be a .wav or .mp3 file longer than 15 seconds. If only a voice reference is given, an a cappella vocal hum will be generated.')
    sample_rate: nodetool.nodes.replicate.video.generate.Music_01.Sample_rate = Field(default=Sample_rate._44100, description='Sample rate for the generated music')
    instrumental_id: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Reuse a previously uploaded instrumental ID')
    instrumental_file: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Instrumental reference. Must be a .wav or .mp3 file longer than 15 seconds. If only an instrumental reference is given, a track without vocals will be generated.')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Music_01"


import nodetool.nodes.replicate.video.generate

class Ray(GraphNode):
    """Fast, high quality text-to-video and image-to-video (Also known as Dream Machine)"""

    Aspect_ratio: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.Ray.Aspect_ratio
    loop: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether the video should loop')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for video generation')
    aspect_ratio: nodetool.nodes.replicate.video.generate.Ray.Aspect_ratio = Field(default=Aspect_ratio._16_9, description="Aspect ratio of the video (e.g. '16:9'). Ignored if a start or end frame or video ID is given.")
    end_video_id: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Prepend a new video generation to the beginning of an existing one (Also called 'reverse extend'). You can combine this with start_image_url, or start_video_id.")
    end_image_url: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='URL of an image to use as the ending frame')
    start_video_id: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Continue or extend a video generation with a new generation. You can combine this with end_image_url, or end_video_id.')
    start_image_url: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='URL of an image to use as the starting frame')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Ray"


import nodetool.nodes.replicate.video.generate

class RobustVideoMatting(GraphNode):
    """extract foreground of a video"""

    Output_type: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.RobustVideoMatting.Output_type
    input_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='Video to segment.')
    output_type: nodetool.nodes.replicate.video.generate.RobustVideoMatting.Output_type = Field(default=Output_type.GREEN_SCREEN, description=None)

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.RobustVideoMatting"



class Video_01(GraphNode):
    """Generate 6s videos with prompts or images. (Also known as Hailuo)"""

    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    prompt_optimizer: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Use prompt optimizer')
    first_frame_image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='First frame image for video generation')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Video_01"



class Video_01_Live(GraphNode):
    """An image-to-video (I2V) model specifically trained for Live2D and general animation use cases"""

    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text prompt for image generation')
    prompt_optimizer: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Use prompt optimizer')
    first_frame_image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='First frame image for video generation')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Video_01_Live"


import nodetool.nodes.replicate.video.generate

class Zeroscope_V2_XL(GraphNode):
    """Zeroscope V2 XL & 576w"""

    Model: typing.ClassVar[type] = nodetool.nodes.replicate.video.generate.Zeroscope_V2_XL.Model
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='fps for the output video')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    model: nodetool.nodes.replicate.video.generate.Zeroscope_V2_XL.Model = Field(default=Model.XL, description='Model to use')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=576, description='Width of the output video')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=320, description='Height of the output video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a horse', description='Input prompt')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Batch size')
    init_video: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='URL of the initial video (optional)')
    num_frames: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Number of frames for the output video')
    init_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of init_video')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale')
    negative_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Negative prompt')
    remove_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Remove watermark')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps')

    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Zeroscope_V2_XL"


