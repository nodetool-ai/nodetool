# nodetool.nodes.replicate.image.enhance

## CodeFormer

Robust face restoration algorithm for old photos/AI-generated faces - (A40 GPU)

**Fields:**
image: ImageRef
upscale: int
face_upsample: bool
background_enhance: bool
codeformer_fidelity: float

## Maxim

Multi-Axis MLP for Image Processing

**Fields:**
image: ImageRef
model: nodetool.nodes.replicate.image.enhance.Maxim.Model | None

## Night_Enhancement

Unsupervised Night Image Enhancement

**Fields:**
image: ImageRef

## OldPhotosRestoration

Bringing Old Photos Back to Life

**Fields:**
HR: bool
image: ImageRef
with_scratch: bool

## Supir_V0F

Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b.

**Fields:**
seed: int | None
image: ImageRef
s_cfg: float
s_churn: float
s_noise: float
upscale: int
a_prompt: str
min_size: float
n_prompt: str
s_stage1: int
s_stage2: float
edm_steps: int
linear_CFG: bool
color_fix_type: Color_fix_type
spt_linear_CFG: float
linear_s_stage2: bool
spt_linear_s_stage2: float

## Supir_V0Q

Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b.

**Fields:**
seed: int | None
image: ImageRef
s_cfg: float
s_churn: float
s_noise: float
upscale: int
a_prompt: str
min_size: float
n_prompt: str
s_stage1: int
s_stage2: float
edm_steps: int
linear_CFG: bool
color_fix_type: Color_fix_type
spt_linear_CFG: float
linear_s_stage2: bool
spt_linear_s_stage2: float

