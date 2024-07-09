from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddAudio(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to add audio to.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to add to the video.')
    volume: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume adjustment for the added audio. 1.0 is original volume.')
    mix: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If True, mix new audio with existing. If False, replace existing audio.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.AddAudio"



class AddSubtitles(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to add subtitles to.')
    subtitles: TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description='SRT Subtitles.')
    font_size: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Font size for the subtitles.')
    font_color: str | GraphNode | tuple[GraphNode, str] = Field(default='white', description='Color of the subtitle text.')
    outline_color: str | GraphNode | tuple[GraphNode, str] = Field(default='black', description='Color of the text outline.')
    outline_width: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Width of the text outline.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.AddSubtitles"



class Blur(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to apply blur effect.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='The strength of the blur effect. Higher values create a stronger blur.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Blur"



class ChromaKey(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to apply chroma key effect.')
    key_color: str | GraphNode | tuple[GraphNode, str] = Field(default='0x00FF00', description="The color to key out (e.g., '0x00FF00' for green).")
    similarity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Similarity threshold for the key color.')
    blend: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Blending of the keyed area edges.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.ChromaKey"



class ColorBalance(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to adjust color balance.')
    red_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Red channel adjustment factor.')
    green_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Green channel adjustment factor.')
    blue_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Blue channel adjustment factor.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.ColorBalance"



class Concat(GraphNode):
    video_a: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The first video to concatenate.')
    video_b: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The second video to concatenate.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Concat"



class CreateVideo(GraphNode):
    frames: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The frames to combine into a video.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The FPS of the output video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.CreateVideo"



class Denoise(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to denoise.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Strength of the denoising effect. Higher values mean more denoising.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Denoise"



class ExtractFrames(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to adjust the brightness for.')
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The frame to start extracting from.')
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The frame to stop extracting from.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.ExtractFrames"



class Fps(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to adjust the brightness for.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Fps"



class Overlay(GraphNode):
    main_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The main (background) video.')
    overlay_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The video to overlay on top.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='X-coordinate for overlay placement.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Y-coordinate for overlay placement.')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Scale factor for the overlay video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Overlay"



class Reverse(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to reverse.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Reverse"



class Rotate(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to rotate.')
    angle: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The angle of rotation in degrees.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Rotate"



class Saturation(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to adjust saturation.')
    saturation: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Saturation"



class SaveVideo(GraphNode):
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The video to save.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, temp_id=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='video', description='Name of the output video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.SaveVideo"



class SetSpeed(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to adjust speed.')
    speed_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The speed adjustment factor. Values > 1 speed up, < 1 slow down.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.SetSpeed"



class Sharpness(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to sharpen.')
    luma_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Amount of sharpening to apply to luma (brightness) channel.')
    chroma_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amount of sharpening to apply to chroma (color) channels.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Sharpness"



class Stabilize(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to stabilize.')
    smoothing: float | GraphNode | tuple[GraphNode, str] = Field(default=10.0, description='Smoothing strength. Higher values result in smoother but potentially more cropped video.')
    crop_black: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to crop black borders that may appear after stabilization.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Stabilize"


from nodetool.nodes.nodetool.video import TransitionType

class Transition(GraphNode):
    video_a: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The first video in the transition.')
    video_b: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The second video in the transition.')
    transition_type: TransitionType | GraphNode | tuple[GraphNode, str] = Field(default=TransitionType('fade'), description='Type of transition effect')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the transition effect in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Transition"



class Trim(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to trim.')
    start_time: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time in seconds for the trimmed video.')
    end_time: float | GraphNode | tuple[GraphNode, str] = Field(default=-1.0, description='The end time in seconds for the trimmed video. Use -1 for the end of the video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.Trim"



class VideoResizeNode(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='The input video to resize.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The target width. Use -1 to maintain aspect ratio.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The target height. Use -1 to maintain aspect ratio.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.VideoResize"


