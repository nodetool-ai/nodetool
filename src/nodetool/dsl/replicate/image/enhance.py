from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CodeFormer(GraphNode):
    """Robust face restoration algorithm for old photos/AI-generated faces"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    upscale: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='The final upsampling scale of the image')
    face_upsample: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Upsample restored faces for high-resolution AI-created images')
    background_enhance: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Enhance background image with Real-ESRGAN')
    codeformer_fidelity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Balance the quality (lower number) and fidelity (higher number).')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.CodeFormer"



class Maxim(GraphNode):
    """Multi-Axis MLP for Image Processing"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image.')
    model: nodetool.nodes.replicate.image.enhance.Maxim.Model | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Choose a model.')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.Maxim"



class Night_Enhancement(GraphNode):
    """Unsupervised Night Image Enhancement"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image.')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.Night_Enhancement"



class OldPhotosRestoration(GraphNode):
    """Bringing Old Photos Back to Life"""

    HR: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='whether the input image is high-resolution')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='input image.')
    with_scratch: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='whether the input image is scratched')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.OldPhotosRestoration"


import nodetool.nodes.replicate.image.enhance

class Supir_V0F(GraphNode):
    """Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b."""

    Color_fix_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.enhance.Supir_V0F.Color_fix_type
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Low quality input image.')
    s_cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description=' Classifier-free guidance scale for prompts.')
    s_churn: float | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Original churn hy-param of EDM.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.003, description='Original noise hy-param of EDM.')
    upscale: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Upsampling ratio of given inputs.')
    a_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.', description='Additive positive prompt for the inputs.')
    min_size: float | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Minimum resolution of output images.')
    n_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth', description='Negative prompt for the inputs.')
    s_stage1: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Control Strength of Stage1 (negative means invalid).')
    s_stage2: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Control Strength of Stage2.')
    edm_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of steps for EDM Sampling Schedule.')
    linear_CFG: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg.")
    color_fix_type: nodetool.nodes.replicate.image.enhance.Supir_V0F.Color_fix_type = Field(default=Color_fix_type.WAVELET, description='Color Fixing Type..')
    spt_linear_CFG: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Start point of linearly increasing CFG.')
    linear_s_stage2: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2.")
    spt_linear_s_stage2: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Start point of linearly increasing s_stage2.')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.Supir_V0F"


import nodetool.nodes.replicate.image.enhance

class Supir_V0Q(GraphNode):
    """Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b."""

    Color_fix_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.enhance.Supir_V0Q.Color_fix_type
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Low quality input image.')
    s_cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description=' Classifier-free guidance scale for prompts.')
    s_churn: float | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Original churn hy-param of EDM.')
    s_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.003, description='Original noise hy-param of EDM.')
    upscale: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Upsampling ratio of given inputs.')
    a_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.', description='Additive positive prompt for the inputs.')
    min_size: float | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Minimum resolution of output images.')
    n_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth', description='Negative prompt for the inputs.')
    s_stage1: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Control Strength of Stage1 (negative means invalid).')
    s_stage2: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Control Strength of Stage2.')
    edm_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of steps for EDM Sampling Schedule.')
    linear_CFG: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg.")
    color_fix_type: nodetool.nodes.replicate.image.enhance.Supir_V0Q.Color_fix_type = Field(default=Color_fix_type.WAVELET, description='Color Fixing Type..')
    spt_linear_CFG: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Start point of linearly increasing CFG.')
    linear_s_stage2: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2.")
    spt_linear_s_stage2: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Start point of linearly increasing s_stage2.')

    @classmethod
    def get_node_type(cls): return "replicate.image.enhance.Supir_V0Q"


