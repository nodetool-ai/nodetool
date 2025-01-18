# nodetool.nodes.replicate.image.enhance

## CodeFormer

Robust face restoration algorithm for old photos/AI-generated faces

**Fields:**
- **image**: Input image (ImageRef)
- **upscale**: The final upsampling scale of the image (int)
- **face_upsample**: Upsample restored faces for high-resolution AI-created images (bool)
- **background_enhance**: Enhance background image with Real-ESRGAN (bool)
- **codeformer_fidelity**: Balance the quality (lower number) and fidelity (higher number). (float)


## Maxim

Multi-Axis MLP for Image Processing

**Fields:**
- **image**: Input image. (ImageRef)
- **model**: Choose a model. (nodetool.nodes.replicate.image.enhance.Maxim.Model | None)


## Night_Enhancement

Unsupervised Night Image Enhancement

**Fields:**
- **image**: Input image. (ImageRef)


## OldPhotosRestoration

Bringing Old Photos Back to Life

**Fields:**
- **HR**: whether the input image is high-resolution (bool)
- **image**: input image. (ImageRef)
- **with_scratch**: whether the input image is scratched (bool)


## Supir_V0F

Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0F model and does NOT use LLaVA-13b.

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Low quality input image. (ImageRef)
- **s_cfg**:  Classifier-free guidance scale for prompts. (float)
- **s_churn**: Original churn hy-param of EDM. (float)
- **s_noise**: Original noise hy-param of EDM. (float)
- **upscale**: Upsampling ratio of given inputs. (int)
- **a_prompt**: Additive positive prompt for the inputs. (str)
- **min_size**: Minimum resolution of output images. (float)
- **n_prompt**: Negative prompt for the inputs. (str)
- **s_stage1**: Control Strength of Stage1 (negative means invalid). (int)
- **s_stage2**: Control Strength of Stage2. (float)
- **edm_steps**: Number of steps for EDM Sampling Schedule. (int)
- **linear_CFG**: Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg. (bool)
- **color_fix_type**: Color Fixing Type.. (Color_fix_type)
- **spt_linear_CFG**: Start point of linearly increasing CFG. (float)
- **linear_s_stage2**: Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2. (bool)
- **spt_linear_s_stage2**: Start point of linearly increasing s_stage2. (float)


## Supir_V0Q

Practicing Model Scaling for Photo-Realistic Image Restoration In the Wild. This is the SUPIR-v0Q model and does NOT use LLaVA-13b.

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Low quality input image. (ImageRef)
- **s_cfg**:  Classifier-free guidance scale for prompts. (float)
- **s_churn**: Original churn hy-param of EDM. (float)
- **s_noise**: Original noise hy-param of EDM. (float)
- **upscale**: Upsampling ratio of given inputs. (int)
- **a_prompt**: Additive positive prompt for the inputs. (str)
- **min_size**: Minimum resolution of output images. (float)
- **n_prompt**: Negative prompt for the inputs. (str)
- **s_stage1**: Control Strength of Stage1 (negative means invalid). (int)
- **s_stage2**: Control Strength of Stage2. (float)
- **edm_steps**: Number of steps for EDM Sampling Schedule. (int)
- **linear_CFG**: Linearly (with sigma) increase CFG from 'spt_linear_CFG' to s_cfg. (bool)
- **color_fix_type**: Color Fixing Type.. (Color_fix_type)
- **spt_linear_CFG**: Start point of linearly increasing CFG. (float)
- **linear_s_stage2**: Linearly (with sigma) increase s_stage2 from 'spt_linear_s_stage2' to s_stage2. (bool)
- **spt_linear_s_stage2**: Start point of linearly increasing s_stage2. (float)


