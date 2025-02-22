from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddAudio(GraphNode):
    """
    Add an audio track to a video, replacing or mixing with existing audio.
    video, audio, soundtrack, merge

    Use cases:
    1. Add background music or narration to a silent video
    2. Replace original audio with a new soundtrack
    3. Mix new audio with existing video sound
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to add audio to.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to add to the video.')
    volume: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume adjustment for the added audio. 1.0 is original volume.')
    mix: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If True, mix new audio with existing. If False, replace existing audio.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.AddAudio"


import nodetool.nodes.nodetool.video
import nodetool.nodes.nodetool.video

class AddSubtitles(GraphNode):
    """
    Add subtitles to a video.
    video, subtitles, text, caption

    Use cases:
    1. Add translations or closed captions to videos
    2. Include explanatory text or commentary in educational videos
    3. Create lyric videos for music content
    """

    SubtitleTextFont: typing.ClassVar[type] = nodetool.nodes.nodetool.video.AddSubtitles.SubtitleTextFont
    SubtitleTextAlignment: typing.ClassVar[type] = nodetool.nodes.nodetool.video.AddSubtitles.SubtitleTextAlignment
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to add subtitles to.')
    chunks: list[AudioChunk] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='Audio chunks to add as subtitles.')
    font: nodetool.nodes.nodetool.video.AddSubtitles.SubtitleTextFont = Field(default=SubtitleTextFont.DejaVuSans, description='The font to use.')
    align: nodetool.nodes.nodetool.video.AddSubtitles.SubtitleTextAlignment = Field(default=SubtitleTextAlignment.BOTTOM, description='Vertical alignment of subtitles.')
    font_size: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='The font size.')
    font_color: ColorRef | GraphNode | tuple[GraphNode, str] = Field(default=ColorRef(type='color', value='#FFFFFF'), description='The font color.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.AddSubtitles"



class Blur(GraphNode):
    """
    Apply a blur effect to a video.
    video, blur, smooth, soften

    Use cases:
    1. Create a dreamy or soft focus effect
    2. Obscure or censor specific areas of the video
    3. Reduce noise or grain in low-quality footage
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to apply blur effect.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='The strength of the blur effect. Higher values create a stronger blur.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Blur"



class ChromaKey(GraphNode):
    """
    Apply chroma key (green screen) effect to a video.
    video, chroma key, green screen, compositing

    Use cases:
    1. Remove green or blue background from video footage
    2. Create special effects by compositing video onto new backgrounds
    3. Produce professional-looking videos for presentations or marketing
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to apply chroma key effect.')
    key_color: ColorRef | GraphNode | tuple[GraphNode, str] = Field(default=ColorRef(type='color', value='#00FF00'), description="The color to key out (e.g., '#00FF00' for green).")
    similarity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Similarity threshold for the key color.')
    blend: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Blending of the keyed area edges.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.ChromaKey"



class ColorBalance(GraphNode):
    """
    Adjust the color balance of a video.
    video, color, balance, adjustment

    Use cases:
    1. Correct color casts in video footage
    2. Enhance specific color tones for artistic effect
    3. Normalize color balance across multiple video clips
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to adjust color balance.')
    red_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Red channel adjustment factor.')
    green_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Green channel adjustment factor.')
    blue_adjust: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Blue channel adjustment factor.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.ColorBalance"



class Concat(GraphNode):
    """
    Concatenate multiple video files into a single video, including audio when available.
    video, concat, merge, combine, audio, +
    """

    video_a: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The first video to concatenate.')
    video_b: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The second video to concatenate.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Concat"



class CreateVideo(GraphNode):
    """
    Combine a sequence of frames into a single video file.
    video, frames, combine, sequence

    Use cases:
    1. Create time-lapse videos from image sequences
    2. Compile processed frames back into a video
    3. Generate animations from individual images
    """

    frames: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The frames to combine into a video.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The FPS of the output video.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.CreateVideo"



class Denoise(GraphNode):
    """
    Apply noise reduction to a video.
    video, denoise, clean, enhance

    Use cases:
    1. Improve video quality by reducing unwanted noise
    2. Enhance low-light footage
    3. Prepare video for further processing or compression
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to denoise.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Strength of the denoising effect. Higher values mean more denoising.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Denoise"



class ExtractAudio(GraphNode):
    """
    Separate audio from a video file.
    video, audio, extract, separate
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to separate.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.ExtractAudio"



class ExtractFrames(GraphNode):
    """
    Extract frames from a video file using OpenCV.
    video, frames, extract, sequence

    Use cases:
    1. Generate image sequences for further processing
    2. Extract specific frame ranges from a video
    3. Create thumbnails or previews from video content
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to extract frames from.')
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The frame to start extracting from.')
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The frame to stop extracting from.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.ExtractFrames"



class Fps(GraphNode):
    """
    Get the frames per second (FPS) of a video file.
    video, analysis, frames, fps

    Use cases:
    1. Analyze video properties for quality assessment
    2. Determine appropriate playback speed for video editing
    3. Ensure compatibility with target display systems
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to adjust the brightness for.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Fps"



class Overlay(GraphNode):
    """
    Overlay one video on top of another, including audio overlay when available.
    video, overlay, composite, picture-in-picture, audio
    """

    main_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The main (background) video.')
    overlay_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The video to overlay on top.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='X-coordinate for overlay placement.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Y-coordinate for overlay placement.')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Scale factor for the overlay video.')
    overlay_audio_volume: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Volume of the overlay audio relative to the main audio.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Overlay"



class ResizeNode(GraphNode):
    """
    Resize a video to a specific width and height.
    video, resize, scale, dimensions

    Use cases:
    1. Adjust video resolution for different display requirements
    2. Reduce file size by downscaling video
    3. Prepare videos for specific platforms with size constraints
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to resize.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The target width. Use -1 to maintain aspect ratio.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The target height. Use -1 to maintain aspect ratio.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Resize"



class Reverse(GraphNode):
    """
    Reverse the playback of a video.
    video, reverse, backwards, effect

    Use cases:
    1. Create artistic effects by playing video in reverse
    2. Analyze motion or events in reverse order
    3. Generate unique transitions or intros for video projects
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to reverse.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Reverse"



class Rotate(GraphNode):
    """
    Rotate a video by a specified angle.
    video, rotate, orientation, transform

    Use cases:
    1. Correct orientation of videos taken with a rotated camera
    2. Create artistic effects by rotating video content
    3. Adjust video for different display orientations
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to rotate.')
    angle: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The angle of rotation in degrees.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Rotate"



class Saturation(GraphNode):
    """
    Adjust the color saturation of a video.
    video, saturation, color, enhance

    Use cases:
    1. Enhance color vibrancy in dull or flat-looking footage
    2. Create stylistic effects by over-saturating or desaturating video
    3. Correct oversaturated footage from certain cameras
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to adjust saturation.')
    saturation: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Saturation"



class SaveVideo(GraphNode):
    """
    Save a video to a file.
    video, save, file, output

    Use cases:
    1. Export processed video to a specific folder
    2. Save video with a custom name
    3. Create a copy of a video in a different location
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The video to save.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='%Y-%m-%d-%H-%M-%S.mp4', description='\n        Name of the output video.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.video.SaveVideo"



class SetSpeed(GraphNode):
    """
    Adjust the playback speed of a video.
    video, speed, tempo, time

    Use cases:
    1. Create slow-motion effects by decreasing video speed
    2. Generate time-lapse videos by increasing playback speed
    3. Synchronize video duration with audio or other timing requirements
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to adjust speed.')
    speed_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The speed adjustment factor. Values > 1 speed up, < 1 slow down.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.SetSpeed"



class Sharpness(GraphNode):
    """
    Adjust the sharpness of a video.
    video, sharpen, enhance, detail

    Use cases:
    1. Enhance detail in slightly out-of-focus footage
    2. Correct softness introduced by video compression
    3. Create stylistic effects by over-sharpening
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to sharpen.')
    luma_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Amount of sharpening to apply to luma (brightness) channel.')
    chroma_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amount of sharpening to apply to chroma (color) channels.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Sharpness"



class Stabilize(GraphNode):
    """
    Apply video stabilization to reduce camera shake and jitter.
    video, stabilize, smooth, shake-reduction

    Use cases:
    1. Improve quality of handheld or action camera footage
    2. Smooth out panning and tracking shots
    3. Enhance viewer experience by reducing motion sickness
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to stabilize.')
    smoothing: float | GraphNode | tuple[GraphNode, str] = Field(default=10.0, description='Smoothing strength. Higher values result in smoother but potentially more cropped video.')
    crop_black: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to crop black borders that may appear after stabilization.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Stabilize"


import nodetool.nodes.nodetool.video

class Transition(GraphNode):
    """
    Create a transition effect between two videos, including audio transition when available.
    video, transition, effect, merge, audio

    Use cases:
    1. Create smooth transitions between video clips in a montage
    2. Add professional-looking effects to video projects
    3. Blend scenes together for creative storytelling
    4. Smoothly transition between audio tracks of different video clips
    """

    TransitionType: typing.ClassVar[type] = nodetool.nodes.nodetool.video.Transition.TransitionType
    video_a: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The first video in the transition.')
    video_b: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The second video in the transition.')
    transition_type: nodetool.nodes.nodetool.video.Transition.TransitionType = Field(default=TransitionType.fade, description='Type of transition effect')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the transition effect in seconds.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Transition"



class Trim(GraphNode):
    """
    Trim a video to a specific start and end time.
    video, trim, cut, segment

    Use cases:
    1. Extract specific segments from a longer video
    2. Remove unwanted parts from the beginning or end of a video
    3. Create shorter clips from a full-length video
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The input video to trim.')
    start_time: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time in seconds for the trimmed video.')
    end_time: float | GraphNode | tuple[GraphNode, str] = Field(default=-1.0, description='The end time in seconds for the trimmed video. Use -1 for the end of the video.')

    @classmethod
    def get_node_type(cls): return "nodetool.video.Trim"


