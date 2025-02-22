from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AMTInterpolation(GraphNode):
    """
    Interpolate between image frames to create smooth video transitions. Supports configurable FPS and recursive interpolation passes for higher quality results.
    video, interpolation, transitions, frames, smoothing, img2vid, image-to-video

    Use cases:
    - Create smooth frame transitions
    - Generate fluid animations
    - Enhance video frame rates
    - Produce slow-motion effects
    - Create seamless video blends
    """

    frames: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[ImageRef(type='image', uri='', asset_id=None, data=None), ImageRef(type='image', uri='', asset_id=None, data=None)], description='List of frames to interpolate between (minimum 2 frames required)')
    output_fps: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Output frames per second')
    recursive_interpolation_passes: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of recursive interpolation passes (higher = smoother)')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.AMTInterpolation"


import nodetool.nodes.fal.image_to_video

class CogVideoX(GraphNode):
    """
    Generate videos from images using CogVideoX-5B. Features high-quality motion synthesis with configurable parameters for fine-tuned control over the output.
    video, generation, motion, synthesis, control, img2vid, image-to-video

    Use cases:
    - Create controlled video animations
    - Generate precise motion effects
    - Produce customized video content
    - Create fine-tuned animations
    - Generate motion sequences
    """

    VideoSize: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.CogVideoX.VideoSize
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    video_size: nodetool.nodes.fal.image_to_video.CogVideoX.VideoSize = Field(default=VideoSize.LANDSCAPE_16_9, description='The size/aspect ratio of the generated video')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Distorted, discontinuous, Ugly, blurry, low resolution, motionless, static, disfigured, disconnected limbs, Ugly faces, incomplete arms', description='What to avoid in the generated video')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps (higher = better quality but slower)')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='How closely to follow the prompt (higher = more faithful but less creative)')
    use_rife: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use RIFE for video interpolation')
    export_fps: int | GraphNode | tuple[GraphNode, str] = Field(default=16, description='Target frames per second for the output video')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same video every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.CogVideoX"



class FastSVD(GraphNode):
    """
    Generate short video clips from your images using SVD v1.1 at Lightning Speed. Features high-quality motion synthesis with configurable parameters for rapid video generation.
    video, generation, fast, motion, synthesis, img2vid, image-to-video

    Use cases:
    - Create quick video animations
    - Generate rapid motion content
    - Produce fast video transitions
    - Create instant visual effects
    - Generate quick previews
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    motion_bucket_id: int | GraphNode | tuple[GraphNode, str] = Field(default=127, description='Controls motion intensity (higher = more motion)')
    cond_aug: float | GraphNode | tuple[GraphNode, str] = Field(default=0.02, description='Amount of noise added to conditioning (higher = more motion)')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of inference steps (higher = better quality but slower)')
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Frames per second of the output video (total length is 25 frames)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same video every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.FastSVD"


import nodetool.nodes.fal.image_to_video

class HaiperImageToVideo(GraphNode):
    """
    Transform images into hyper-realistic videos with Haiper 2.0. Experience industry-leading resolution, fluid motion, and rapid generation for stunning AI videos.
    video, generation, hyper-realistic, motion, animation, image-to-video, img2vid

    Use cases:
    - Create cinematic animations
    - Generate dynamic video content
    - Transform static images into motion
    - Produce high-resolution videos
    - Create visual effects
    """

    VideoDuration: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.HaiperImageToVideo.VideoDuration
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    duration: nodetool.nodes.fal.image_to_video.HaiperImageToVideo.VideoDuration = Field(default=VideoDuration.FOUR_SECONDS, description='The duration of the generated video in seconds')
    prompt_enhancer: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description="Whether to use the model's prompt enhancer")
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same video every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.HaiperImageToVideo"


import nodetool.nodes.fal.image_to_video
import nodetool.nodes.fal.image_to_video

class KlingVideo(GraphNode):
    """
    Generate video clips from your images using Kling 1.6. Supports multiple durations and aspect ratios.
    video, generation, animation, duration, aspect-ratio, img2vid, image-to-video

    Use cases:
    - Create custom video content
    - Generate video animations
    - Transform static images
    - Produce motion graphics
    - Create visual presentations
    """

    KlingDuration: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.KlingVideo.KlingDuration
    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.KlingVideo.AspectRatio
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    duration: nodetool.nodes.fal.image_to_video.KlingVideo.KlingDuration = Field(default=KlingDuration.FIVE_SECONDS, description='The duration of the generated video')
    aspect_ratio: nodetool.nodes.fal.image_to_video.KlingVideo.AspectRatio = Field(default=AspectRatio.RATIO_16_9, description='The aspect ratio of the generated video frame')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.KlingVideo"


import nodetool.nodes.fal.image_to_video
import nodetool.nodes.fal.image_to_video

class KlingVideoPro(GraphNode):
    """
    Generate video clips from your images using Kling 1.6 Pro. The professional version offers enhanced quality and performance compared to the standard version.
    video, generation, professional, quality, performance, img2vid, image-to-video

    Use cases:
    - Create professional video content
    - Generate high-quality animations
    - Produce commercial video assets
    - Create advanced motion graphics
    - Generate premium visual content
    """

    KlingDuration: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.KlingVideoPro.KlingDuration
    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.KlingVideoPro.AspectRatio
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    duration: nodetool.nodes.fal.image_to_video.KlingVideoPro.KlingDuration = Field(default=KlingDuration.FIVE_SECONDS, description='The duration of the generated video')
    aspect_ratio: nodetool.nodes.fal.image_to_video.KlingVideoPro.AspectRatio = Field(default=AspectRatio.RATIO_16_9, description='The aspect ratio of the generated video frame')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.KlingVideoPro"



class LTXVideo(GraphNode):
    """
    Generate videos from images using LTX Video. Best results with 768x512 images and detailed, chronological descriptions of actions and scenes.
    video, generation, chronological, scenes, actions, img2vid, image-to-video

    Use cases:
    - Create scene-based animations
    - Generate sequential video content
    - Produce narrative videos
    - Create storyboard animations
    - Generate action sequences
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video (768x512 recommended)')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A detailed description of the desired video motion and style')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly', description='What to avoid in the generated video')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of inference steps (higher = better quality but slower)')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.0, description='How closely to follow the prompt (higher = more faithful)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same video every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.LTXVideo"


import nodetool.nodes.fal.image_to_video

class LumaDreamMachine(GraphNode):
    """
    Generate video clips from your images using Luma Dream Machine v1.5. Supports various aspect ratios and optional end-frame blending.
    video, generation, animation, blending, aspect-ratio, img2vid, image-to-video

    Use cases:
    - Create seamless video loops
    - Generate video transitions
    - Transform images into animations
    - Create motion graphics
    - Produce video content
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.LumaDreamMachine.AspectRatio
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    aspect_ratio: nodetool.nodes.fal.image_to_video.LumaDreamMachine.AspectRatio = Field(default=AspectRatio.RATIO_16_9, description='The aspect ratio of the generated video')
    loop: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether the video should loop (end blends with beginning)')
    end_image: nodetool.metadata.types.ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional image to blend the end of the video with')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.LumaDreamMachine"



class MiniMaxVideo(GraphNode):
    """
    Generate video clips from your images using MiniMax Video model. Transform static art into dynamic masterpieces with enhanced smoothness and vivid motion.
    video, generation, art, motion, smoothness, img2vid, image-to-video

    Use cases:
    - Transform artwork into videos
    - Create smooth animations
    - Generate artistic motion content
    - Produce dynamic visualizations
    - Create video art pieces
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A description of the desired video motion and style')
    prompt_optimizer: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description="Whether to use the model's prompt optimizer")

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.MiniMaxVideo"



class MuseTalk(GraphNode):
    """
    Real-time high quality audio-driven lip-syncing model. Animate a face video with custom audio for natural-looking speech animation.
    video, lip-sync, animation, speech, real-time, wav2vid, audio-to-video

    Use cases:
    - Create lip-synced videos
    - Generate speech animations
    - Produce dubbed content
    - Create animated presentations
    - Generate voice-over videos
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='URL of the source video to animate')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='URL of the audio file to drive the lip sync')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.MuseTalk"


import nodetool.nodes.fal.image_to_video
import nodetool.nodes.fal.image_to_video

class SadTalker(GraphNode):
    """
    Generate talking face animations from a single image and audio file. Features configurable face model resolution and expression controls.
    video, animation, face, talking, expression, img2vid, image-to-video, audio-to-video, wav2vid

    Use cases:
    - Create talking head videos
    - Generate lip-sync animations
    - Produce character animations
    - Create video presentations
    - Generate facial expressions
    """

    FaceModelResolution: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.SadTalker.FaceModelResolution
    PreprocessType: typing.ClassVar[type] = nodetool.nodes.fal.image_to_video.SadTalker.PreprocessType
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The source image to animate')
    audio: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='URL of the audio file to drive the animation')
    face_model_resolution: nodetool.nodes.fal.image_to_video.SadTalker.FaceModelResolution = Field(default=FaceModelResolution.RESOLUTION_256, description='Resolution of the face model')
    expression_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Scale of the expression (1.0 = normal)')
    still_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="Reduce head motion (works with preprocess 'full')")
    preprocess: nodetool.nodes.fal.image_to_video.SadTalker.PreprocessType = Field(default=PreprocessType.CROP, description='Type of image preprocessing to apply')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.SadTalker"



class StableVideo(GraphNode):
    """
    Generate short video clips from your images using Stable Video Diffusion v1.1. Features high-quality motion synthesis with configurable parameters.
    video, generation, diffusion, motion, synthesis, img2vid, image-to-video

    Use cases:
    - Create stable video animations
    - Generate motion content
    - Transform images into videos
    - Produce smooth transitions
    - Create visual effects
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to transform into a video')
    motion_bucket_id: int | GraphNode | tuple[GraphNode, str] = Field(default=127, description='Controls motion intensity (higher = more motion)')
    cond_aug: float | GraphNode | tuple[GraphNode, str] = Field(default=0.02, description='Amount of noise added to conditioning (higher = more motion)')
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Frames per second of the output video')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same video every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_video.StableVideo"


