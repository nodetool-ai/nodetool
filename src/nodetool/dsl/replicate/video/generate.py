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
    base_model: Base_model | GraphNode | tuple[GraphNode, str] = Field(default=Base_model('realisticVisionV20_v20'), description='Select a base model (DreamBooth checkpoint)')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('mp4'), description="Output format of the video. Can be 'mp4' or 'gif'")
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


from nodetool.nodes.replicate.video.generate import Scheduler
from nodetool.nodes.replicate.video.generate import Base_model
from nodetool.nodes.replicate.video.generate import Output_format

class AnimateDiffIllusions(GraphNode):
    loop: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description="Flag to loop the video. Use when you have an 'infinitely' repeating video/gif ControlNet video")
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed for different images and reproducibility. Leave blank to randomise seed')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=256, description='Width of generated video in pixels, must be divisable by 8')
    frames: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds)')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=384, description='Height of generated video in pixels, must be divisable by 8')
    context: int | GraphNode | tuple[GraphNode, str] = Field(default=16, description='Number of frames to condition on (default: max of <length> or 32). max for motion module v1 is 24')
    clip_skip: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Skip the last N-1 layers of the CLIP text encoder (lower values follow prompt more closely)')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('k_dpmpp_sde'), description='Diffusion scheduler')
    base_model: Base_model | GraphNode | tuple[GraphNode, str] = Field(default=Base_model('majicmixRealistic_v5Preview'), description="Choose the base model for animation generation. If 'CUSTOM' is selected, provide a custom model URL in the next parameter")
    prompt_map: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Prompt for changes in animation. Provide 'frame number : prompt at this frame', separate different prompts with '|'. Make sure the frame number does not exceed the length of video (frames)")
    head_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='masterpiece, best quality, a haunting and detailed depiction of a ship at sea, battered by waves, ominous,((dark clouds:1.3)),distant lightning, rough seas, rain, silhouette of the ship against the stormy sky', description='Primary animation prompt. If a prompt map is provided, this will be prefixed at the start of every individual prompt in the map')
    tail_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Additional prompt that will be appended at the end of the main prompt or individual prompts in the map')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('mp4'), description="Output format of the video. Can be 'mp4' or 'gif'")
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance Scale. How closely do we want to adhere to the prompt and its contents')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    controlnet_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='A short video/gif that will be used as the keyframes for QR Code Monster to use, Please note, all of the frames will be used as keyframes')
    film_interpolation: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use FILM for between-frame interpolation (film-net.github.io)')
    prompt_fixed_ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Defines the ratio of adherence to the fixed part of the prompt versus the dynamic part (from prompt map). Value should be between 0 (only dynamic) to 1 (only fixed).')
    custom_base_model_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Only used when base model is set to 'CUSTOM'. URL of the custom model to download if 'CUSTOM' is selected in the base model. Only downloads from 'https://civitai.com/api/download/models/' are allowed")
    num_interpolation_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Number of steps to interpolate between animation frames')
    enable_qr_code_monster_v2: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Flag to enable QR Code Monster V2 ControlNet')
    playback_frames_per_second: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description=None)
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.18, description='Strength of ControlNet. The outputs of the ControlNet are multiplied by `controlnet_conditioning_scale` before they are added to the residual in the original UNet')
    qr_code_monster_v2_guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Flag to enable guess mode (un-guided) for QR Code Monster V2 ControlNet')
    qr_code_monster_v2_preprocessor: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Flag to pre-process keyframes for QR Code Monster V2 ControlNet')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.AnimateDiffIllusions"



class AudioToWaveform(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='Audio file to create waveform from')
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
    width: Width | GraphNode | tuple[GraphNode, str] = Field(default=Width(672), description='Width of the output')
    height: Height | GraphNode | tuple[GraphNode, str] = Field(default=Height(384), description='Height of the output')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a camel smoking a cigarette, hd, high quality', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('EulerAncestralDiscreteScheduler'), description='Select a Scheduler')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='blurry', description='Negative prompt')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.HotshotXL"


from nodetool.nodes.replicate.video.generate import Output_type

class RobustVideoMatting(GraphNode):
    input_video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, temp_id=None, duration=None, format=None), description='Video to segment.')
    output_type: Output_type | GraphNode | tuple[GraphNode, str] = Field(default=Output_type('green-screen'), description=None)
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.RobustVideoMatting"


from nodetool.nodes.replicate.video.generate import Output_format

class StableDiffusionInfiniteZoom(GraphNode):
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt')
    inpaint_iter: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description="Number of iterations of pasting the image in it's center and inpainting the boarders")
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('mp4'), description='infinite loop gif or mp4 video')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.StableDiffusionInfiniteZoom"



class Tooncrafter(GraphNode):
    loop: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Loop the video')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    image_1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='First input image')
    image_2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Second input image')
    image_3: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Third input image (optional)')
    image_4: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Fourth input image (optional)')
    image_5: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Fifth input image (optional)')
    image_6: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Sixth input image (optional)')
    image_7: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Seventh input image (optional)')
    image_8: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Eighth input image (optional)')
    image_9: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Ninth input image (optional)')
    image_10: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Tenth input image (optional)')
    max_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Maximum width of the video')
    max_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Maximum height of the video')
    interpolate: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable 2x interpolation using FILM')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want to see in your video')
    color_correction: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If the colors are coming out strange, or if the colors between your input images are very different, disable this')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.Tooncrafter"


from nodetool.nodes.replicate.video.generate import Mode
from nodetool.nodes.replicate.video.generate import Checkpoint
from nodetool.nodes.replicate.video.generate import Aspect_ratio

class VideoMorpher(GraphNode):
    mode: Mode | GraphNode | tuple[GraphNode, str] = Field(default=Mode('medium'), description='Determines if you produce a quick experimental video or an upscaled interpolated one. (small ~20s, medium ~60s, upscaled ~2min, upscaled-and-interpolated ~4min)')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Set a seed for reproducibility. Random by default.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt has a small effect, but most of the video is driven by the subject images')
    checkpoint: Checkpoint | GraphNode | tuple[GraphNode, str] = Field(default=Checkpoint('realistic'), description='The checkpoint to use for the model')
    style_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='Apply the style from this image to the whole video')
    aspect_ratio: Aspect_ratio | GraphNode | tuple[GraphNode, str] = Field(default=Aspect_ratio('2:3'), description='The aspect ratio of the video')
    style_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How strong the style is applied')
    use_controlnet: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Use geometric circles to guide the generation')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='What you do not want to see in the video')
    subject_image_1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The first subject of the video')
    subject_image_2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The second subject of the video')
    subject_image_3: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The third subject of the video')
    subject_image_4: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The fourth subject of the video')
    @classmethod
    def get_node_type(cls): return "replicate.video.generate.VideoMorpher"


from nodetool.nodes.replicate.video.generate import Model

class Zeroscope_V2_XL(GraphNode):
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='fps for the output video')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('xl'), description='Model to use')
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


