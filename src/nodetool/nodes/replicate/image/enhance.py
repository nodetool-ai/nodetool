from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class CodeFormer(ReplicateNode):
    """Robust face restoration algorithm for old photos/AI-generated faces - (A40 GPU)"""

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/codeformer:78f2bab438ab0ffc85a68cdfd316a2ecd3994b5dd26aa6b3d203357b45e5eb1b"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/cf736d61-411f-4301-89b3-16aff1a02ed1/codeformer_logo.png",
            "created_at": "2023-09-06T04:10:50.158696Z",
            "description": "Robust face restoration algorithm for old photos/AI-generated faces - (A40 GPU)",
            "github_url": "https://github.com/sczhou/CodeFormer",
            "license_url": "https://github.com/sczhou/CodeFormer/blob/master/LICENSE",
            "name": "codeformer",
            "owner": "lucataco",
            "paper_url": "https://arxiv.org/abs/2206.11253",
            "run_count": 306794,
            "url": "https://replicate.com/lucataco/codeformer",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    upscale: int = Field(
        title="Upscale",
        description="The final upsampling scale of the image",
        default=2,
    )
    face_upsample: bool = Field(
        title="Face Upsample",
        description="Upsample restored faces for high-resolution AI-created images",
        default=True,
    )
    background_enhance: bool = Field(
        title="Background Enhance",
        description="Enhance background image with Real-ESRGAN",
        default=True,
    )
    codeformer_fidelity: float = Field(
        title="Codeformer Fidelity",
        description="Balance the quality (lower number) and fidelity (higher number).",
        ge=0.0,
        le=1.0,
        default=0.5,
    )


class Night_Enhancement(ReplicateNode):
    """Unsupervised Night Image Enhancement"""

    @classmethod
    def replicate_model_id(cls):
        return "cjwbw/night-enhancement:4328e402cfedafa70ad7cec04412e86ab61832204deccd94108ae5222c9b1ae1"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/60c4c0d8-c82f-42e0-96ee-71392d32b6fe/output.png",
            "created_at": "2022-08-13T15:54:02.662983Z",
            "description": "Unsupervised Night Image Enhancement",
            "github_url": "https://github.com/jinyeying/night-enhancement",
            "license_url": "https://github.com/jinyeying/night-enhancement/blob/main/LICENSE",
            "name": "night-enhancement",
            "owner": "cjwbw",
            "paper_url": "https://arxiv.org/pdf/2207.10564.pdf",
            "run_count": 40338,
            "url": "https://replicate.com/cjwbw/night-enhancement",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image.")


class Supir_V0Q(ReplicateNode):
    """Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b."""

    class Color_fix_type(str, Enum):
        NONE = "None"
        ADAIN = "AdaIn"
        WAVELET = "Wavelet"

    @classmethod
    def replicate_model_id(cls):
        return "cjwbw/supir-v0q:ede69f6a5ae7d09f769d683347325b08d2f83a93d136ed89747941205e0a71da"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/gYLkKNiBcnZDD9dnPxlUR4iurpbr1QANec0VmA2kv3Ol6zMJA/out.png",
            "created_at": "2024-02-23T16:26:24.376439Z",
            "description": "Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b.",
            "github_url": "https://github.com/chenxwh/SUPIR",
            "license_url": "https://github.com/Fanghua-Yu/SUPIR/blob/master/LICENSE",
            "name": "supir-v0q",
            "owner": "cjwbw",
            "paper_url": "https://arxiv.org/abs/2401.13627",
            "run_count": 4957,
            "url": "https://replicate.com/cjwbw/supir-v0q",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(default=ImageRef(), description="Low quality input image.")
    s_cfg: float = Field(
        title="S Cfg",
        description=" Classifier-free guidance scale for prompts.",
        ge=1.0,
        le=20.0,
        default=7.5,
    )
    s_churn: float = Field(
        title="S Churn", description="Original churn hy-param of EDM.", default=5
    )
    s_noise: float = Field(
        title="S Noise", description="Original noise hy-param of EDM.", default=1.003
    )
    upscale: int = Field(
        title="Upscale", description="Upsampling ratio of given inputs.", default=1
    )
    a_prompt: str = Field(
        title="A Prompt",
        description="Additive positive prompt for the inputs.",
        default="Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.",
    )
    min_size: float = Field(
        title="Min Size",
        description="Minimum resolution of output images.",
        default=1024,
    )
    n_prompt: str = Field(
        title="N Prompt",
        description="Negative prompt for the inputs.",
        default="painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth",
    )
    s_stage1: int = Field(
        title="S Stage1",
        description="Control Strength of Stage1 (negative means invalid).",
        default=-1,
    )
    s_stage2: float = Field(
        title="S Stage2", description="Control Strength of Stage2.", default=1
    )
    edm_steps: int = Field(
        title="Edm Steps",
        description="Number of steps for EDM Sampling Schedule.",
        ge=1.0,
        le=500.0,
        default=50,
    )
    linear_CFG: bool = Field(
        title="Linear Cfg",
        description="Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg.",
        default=False,
    )
    color_fix_type: Color_fix_type = Field(
        description="Color Fixing Type..", default=Color_fix_type("Wavelet")
    )
    spt_linear_CFG: float = Field(
        title="Spt Linear Cfg",
        description="Start point of linearly increasing CFG.",
        default=1,
    )
    linear_s_stage2: bool = Field(
        title="Linear S Stage2",
        description="Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2.",
        default=False,
    )
    spt_linear_s_stage2: float = Field(
        title="Spt Linear S Stage2",
        description="Start point of linearly increasing s_stage2.",
        default=0,
    )


class Supir_V0F(ReplicateNode):
    """Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b."""

    class Color_fix_type(str, Enum):
        NONE = "None"
        ADAIN = "AdaIn"
        WAVELET = "Wavelet"

    @classmethod
    def replicate_model_id(cls):
        return "cjwbw/supir-v0f:b9c26267b41f3617099b53f09f2d894a621ebf4a59b632bfedb5031eeabd8959"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/if3rev1GNfAB6IMsqqW8CqQtVP75pXvU3dLQeV6CFkVutgmJB/out.png",
            "created_at": "2024-02-23T16:38:51.414944Z",
            "description": "Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b.",
            "github_url": "https://github.com/chenxwh/SUPIR",
            "license_url": "https://github.com/Fanghua-Yu/SUPIR/blob/master/LICENSE",
            "name": "supir-v0f",
            "owner": "cjwbw",
            "paper_url": "https://arxiv.org/abs/2401.13627",
            "run_count": 7080,
            "url": "https://replicate.com/cjwbw/supir-v0f",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(default=ImageRef(), description="Low quality input image.")
    s_cfg: float = Field(
        title="S Cfg",
        description=" Classifier-free guidance scale for prompts.",
        ge=1.0,
        le=20.0,
        default=7.5,
    )
    s_churn: float = Field(
        title="S Churn", description="Original churn hy-param of EDM.", default=5
    )
    s_noise: float = Field(
        title="S Noise", description="Original noise hy-param of EDM.", default=1.003
    )
    upscale: int = Field(
        title="Upscale", description="Upsampling ratio of given inputs.", default=1
    )
    a_prompt: str = Field(
        title="A Prompt",
        description="Additive positive prompt for the inputs.",
        default="Cinematic, High Contrast, highly detailed, taken using a Canon EOS R camera, hyper detailed photo - realistic maximum detail, 32k, Color Grading, ultra HD, extreme meticulous detailing, skin pore detailing, hyper sharpness, perfect without deformations.",
    )
    min_size: float = Field(
        title="Min Size",
        description="Minimum resolution of output images.",
        default=1024,
    )
    n_prompt: str = Field(
        title="N Prompt",
        description="Negative prompt for the inputs.",
        default="painting, oil painting, illustration, drawing, art, sketch, oil painting, cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst quality, low quality, frames, watermark, signature, jpeg artifacts, deformed, lowres, over-smooth",
    )
    s_stage1: int = Field(
        title="S Stage1",
        description="Control Strength of Stage1 (negative means invalid).",
        default=-1,
    )
    s_stage2: float = Field(
        title="S Stage2", description="Control Strength of Stage2.", default=1
    )
    edm_steps: int = Field(
        title="Edm Steps",
        description="Number of steps for EDM Sampling Schedule.",
        ge=1.0,
        le=500.0,
        default=50,
    )
    linear_CFG: bool = Field(
        title="Linear Cfg",
        description="Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg.",
        default=False,
    )
    color_fix_type: Color_fix_type = Field(
        description="Color Fixing Type..", default=Color_fix_type("Wavelet")
    )
    spt_linear_CFG: float = Field(
        title="Spt Linear Cfg",
        description="Start point of linearly increasing CFG.",
        default=1,
    )
    linear_s_stage2: bool = Field(
        title="Linear S Stage2",
        description="Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2.",
        default=False,
    )
    spt_linear_s_stage2: float = Field(
        title="Spt Linear S Stage2",
        description="Start point of linearly increasing s_stage2.",
        default=0,
    )


class Maxim(ReplicateNode):
    """Multi-Axis MLP for Image Processing"""

    class Model(str, Enum):
        IMAGE_DENOISING = "Image Denoising"
        IMAGE_DEBLURRING__GOPRO = "Image Deblurring (GoPro)"
        IMAGE_DEBLURRING__REDS = "Image Deblurring (REDS)"
        IMAGE_DEBLURRING__REALBLUR_R = "Image Deblurring (RealBlur_R)"
        IMAGE_DEBLURRING__REALBLUR_J = "Image Deblurring (RealBlur_J)"
        IMAGE_DERAINING__RAIN_STREAK = "Image Deraining (Rain streak)"
        IMAGE_DERAINING__RAIN_DROP = "Image Deraining (Rain drop)"
        IMAGE_DEHAZING__INDOOR = "Image Dehazing (Indoor)"
        IMAGE_DEHAZING__OUTDOOR = "Image Dehazing (Outdoor)"
        IMAGE_ENHANCEMENT__LOW_LIGHT = "Image Enhancement (Low-light)"
        IMAGE_ENHANCEMENT__RETOUCHING = "Image Enhancement (Retouching)"

    @classmethod
    def replicate_model_id(cls):
        return "google-research/maxim:494ca4d578293b4b93945115601b6a38190519da18467556ca223d219c3af9f9"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/716ffa94-41f7-46b4-a2f0-287f0e907f9c/output.png",
            "created_at": "2022-04-20T16:32:30.049391Z",
            "description": "Multi-Axis MLP for Image Processing",
            "github_url": "https://github.com/google-research/maxim",
            "license_url": "https://github.com/google-research/maxim/blob/main/LICENSE",
            "name": "maxim",
            "owner": "google-research",
            "paper_url": "https://arxiv.org/abs/2201.02973",
            "run_count": 425960,
            "url": "https://replicate.com/google-research/maxim",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image.")
    model: Model | None = Field(description="Choose a model.", default=None)


class OldPhotosRestoration(ReplicateNode):
    """Bringing Old Photos Back to Life"""

    @classmethod
    def replicate_model_id(cls):
        return "microsoft/bringing-old-photos-back-to-life:c75db81db6cbd809d93cc3b7e7a088a351a3349c9fa02b6d393e35e0d51ba799"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/18b02ad9-ae81-4044-800e-65732df6bdc7/out.png",
            "created_at": "2021-09-11T14:44:30.681818Z",
            "description": "Bringing Old Photos Back to Life",
            "github_url": "https://github.com/microsoft/Bringing-Old-Photos-Back-to-Life",
            "license_url": "https://github.com/microsoft/Bringing-Old-Photos-Back-to-Life/blob/master/LICENSE",
            "name": "bringing-old-photos-back-to-life",
            "owner": "microsoft",
            "paper_url": "https://arxiv.org/abs/2004.09484",
            "run_count": 870478,
            "url": "https://replicate.com/microsoft/bringing-old-photos-back-to-life",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    HR: bool = Field(
        title="Hr",
        description="whether the input image is high-resolution",
        default=False,
    )
    image: ImageRef = Field(default=ImageRef(), description="input image.")
    with_scratch: bool = Field(
        title="With Scratch",
        description="whether the input image is scratched",
        default=False,
    )
