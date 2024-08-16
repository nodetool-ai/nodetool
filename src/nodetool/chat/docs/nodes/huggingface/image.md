# nodetool.nodes.huggingface.image

## AuraFlow

Generates images using the AuraFlow pipeline.

Use cases:
- Create unique images from text descriptions
- Generate illustrations for creative projects
- Produce visual content for digital media

**Fields:**
prompt: str
negative_prompt: str
guidance_scale: float
num_inference_steps: int
width: int
height: int
seed: int

## BaseImageToImage

Base class for image-to-image transformation tasks.

**Fields:**
inputs: ImageRef
prompt: str

## DepthEstimation

Estimates depth from a single image.

Use cases:
- Generate depth maps for 3D modeling
- Assist in augmented reality applications
- Enhance computer vision systems for robotics
- Improve scene understanding in autonomous vehicles

**Fields:**
model: DepthEstimationModelId
inputs: ImageRef

## FindSegment

Extracts a specific segment from a list of segmentation masks.

**Fields:**
segments: list
segment_label: str

## IPAdapter_SD15_Model

An enumeration.

## IPAdapter_SDXL_Model

An enumeration.

## ImageClassifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images
- Visual quality control in manufacturing to identify defective products
- Medical image analysis to assist in diagnosing conditions

**Fields:**
model: ImageClassifierModelId
inputs: ImageRef

## InstructPix2Pix

Performs image editing based on text instructions using the InstructPix2Pix model.

Use cases:
- Apply specific edits to images based on text instructions
- Modify image content or style guided by text prompts
- Create variations of existing images with controlled changes

**Fields:**
inputs: ImageRef
prompt: str
negative_prompt: str
num_inference_steps: int
guidance_scale: float
image_guidance_scale: float

## Kandinsky2

Generates images using the Kandinsky 2.2 model from text prompts.

Use cases:
- Create high-quality images from text descriptions
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Fields:**
prompt: str
negative_prompt: str
num_inference_steps: int
width: int
height: int
seed: int

## Kandinsky2ControlNet

Transforms existing images based on text prompts and control images using the Kandinsky 2.2 model with ControlNet.

Use cases:
- Transform existing images based on text prompts with precise control
- Apply specific styles or concepts to existing images guided by control images
- Modify photographs or artworks with AI-generated elements while maintaining specific structures
- Create variations of existing visual content with controlled transformations

**Fields:**
prompt: str
negative_prompt: str
hint: ImageRef
height: int
width: int
num_inference_steps: int
guidance_scale: float
seed: int
output_type: str

## Kandinsky2Img2Img

Transforms existing images based on text prompts using the Kandinsky 2.2 model.

Use cases:
- Transform existing images based on text prompts
- Apply specific styles or concepts to existing images
- Modify photographs or artworks with AI-generated elements
- Create variations of existing visual content

**Fields:**
prompt: str
negative_prompt: str
num_inference_steps: int
strength: float
image: ImageRef
seed: int

## Kandinsky3

Generates images using the Kandinsky-3 model from text prompts.

Use cases:
- Create detailed images from text descriptions
- Generate unique illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Fields:**
prompt: str
num_inference_steps: int
width: int
height: int
seed: int

## Kandinsky3Img2Img

Transforms existing images using the Kandinsky-3 model based on text prompts.

Use cases:
- Modify existing images based on text descriptions
- Apply specific styles or concepts to photographs or artwork
- Create variations of existing visual content
- Blend AI-generated elements with existing images

**Fields:**
prompt: str
num_inference_steps: int
strength: float
image: ImageRef
seed: int

## LORA_SDXL_Model

An enumeration.

## ObjectDetection

Detects and localizes objects in images.

Use cases:
- Identify and count objects in images
- Locate specific items in complex scenes
- Assist in autonomous vehicle vision systems
- Enhance security camera footage analysis

**Fields:**
model: ObjectDetectionModelId
inputs: ImageRef
threshold: float
top_k: int

## PixArtAlpha

Generates images from text prompts using the PixArt-Alpha model.

Use cases:
- Create unique images from detailed text descriptions
- Generate concept art for creative projects
- Produce visual content for digital media and marketing
- Explore AI-generated imagery for artistic inspiration

**Fields:**
prompt: str
num_inference_steps: int
guidance_scale: float
width: int
height: int
seed: int

## SDXLTurbo

Generates images from text prompts using SDXL Turbo.

Use cases:
- Rapid prototyping of visual concepts
- Real-time image generation for interactive applications
- Quick visualization of ideas for brainstorming sessions
- Creating multiple variations of an image concept quickly

**Fields:**
model: SDXLTurboModelId
prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int

## SDXLTurboImg2Img

Transforms existing images based on text prompts using SDXL Turbo.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering stock photos for unique marketing materials
- Transforming rough sketches into detailed illustrations
- Creating variations of existing artwork or designs

**Fields:**
model: SDXLTurboModelId
prompt: str
init_image: ImageRef
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
strength: float

## SDXLTurboModelId

An enumeration.

## Segmentation

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

**Fields:**
model: SegmentationModelId
image: ImageRef

## StableCascade

Generates images using the Stable Cascade model, which involves a two-stage process with a prior and a decoder.

Use cases:
- Create high-quality images from text descriptions
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art

**Fields:**
prompt: str
negative_prompt: str
width: int
height: int
prior_num_inference_steps: int
decoder_num_inference_steps: int
prior_guidance_scale: float
decoder_guidance_scale: float
seed: int

## StableDiffusion

Generates images from text prompts using Stable Diffusion.

Use cases:
- Creating custom illustrations for various projects
- Generating concept art for creative endeavors
- Producing unique visual content for marketing materials
- Exploring AI-generated art for personal or professional use

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
width: int
height: int

## StableDiffusion3ControlNetNode

Generates images using Stable Diffusion 3 with ControlNet.

Use cases:
- Generate images with precise control over composition and structure
- Create variations of existing images while maintaining specific features
- Artistic image generation with guided outputs

**Fields:**
prompt: str
control_model: StableDiffusion3ControlNetModelId
control_image: ImageRef
controlnet_conditioning_scale: float
num_inference_steps: int
seed: int

## StableDiffusionBaseNode

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float

## StableDiffusionControlNetImg2ImgNode

Transforms existing images using Stable Diffusion with ControlNet guidance.

Use cases:
- Modify existing images with precise control over composition and structure
- Apply specific styles or concepts to photographs or artwork with guided transformations
- Create variations of existing visual content while maintaining certain features
- Enhance image editing capabilities with AI-guided transformations

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
controlnet: StableDiffusionControlNetModel
image: ImageRef
control_image: ImageRef

## StableDiffusionControlNetInpaintNode

Performs inpainting on images using Stable Diffusion with ControlNet guidance.

Use cases:
- Remove unwanted objects from images with precise control
- Fill in missing parts of images guided by control images
- Modify specific areas of images while preserving the rest and maintaining structure

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
controlnet: StableDiffusionControlNetModel
init_image: ImageRef
mask_image: ImageRef
control_image: ImageRef
controlnet_conditioning_scale: float

## StableDiffusionControlNetModel

An enumeration.

## StableDiffusionControlNetNode

Generates images using Stable Diffusion with ControlNet guidance.

Use cases:
- Generate images with precise control over composition and structure
- Create variations of existing images while maintaining specific features
- Artistic image generation with guided outputs

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
controlnet: StableDiffusionControlNetModel
control_image: ImageRef
controlnet_conditioning_scale: float

## StableDiffusionImg2ImgNode

Transforms existing images based on text prompts using Stable Diffusion.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering photographs
- Creating variations of existing artwork
- Applying text-guided edits to images

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
init_image: ImageRef
strength: float

## StableDiffusionInpaintNode

Performs inpainting on images using Stable Diffusion.

Use cases:
- Remove unwanted objects from images
- Fill in missing parts of images
- Modify specific areas of images while preserving the rest

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
init_image: ImageRef
mask_image: ImageRef
strength: float

## StableDiffusionModelId

An enumeration.

## StableDiffusionScheduler

An enumeration.

## StableDiffusionUpscale

Upscales an image using Stable Diffusion upscaler model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Create high-resolution versions of small images

**Fields:**
model: StableDiffusionModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
scheduler: StableDiffusionScheduler
ip_adapter_model: IPAdapter_SD15_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
image: ImageRef

## StableDiffusionXL

Generates images from text prompts using Stable Diffusion XL.

Use cases:
- Creating custom illustrations for marketing materials
- Generating concept art for game and film development
- Producing unique stock imagery for websites and publications
- Visualizing interior design concepts for clients

**Fields:**
model: StableDiffusionXLModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
scheduler: StableDiffusionScheduler
lora_model: LORA_SDXL_Model
lora_scale: float
ip_adapter_model: IPAdapter_SDXL_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float

## StableDiffusionXLBase

**Fields:**
model: StableDiffusionXLModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
scheduler: StableDiffusionScheduler
lora_model: LORA_SDXL_Model
lora_scale: float
ip_adapter_model: IPAdapter_SDXL_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float

## StableDiffusionXLControlNetNode

Generates images using Stable Diffusion XL with ControlNet.

Use cases:
- Generate high-quality images with precise control over structures and features
- Create variations of existing images while maintaining specific characteristics
- Artistic image generation with guided outputs based on various control types

**Fields:**
model: StableDiffusionXLModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
scheduler: StableDiffusionScheduler
lora_model: LORA_SDXL_Model
lora_scale: float
ip_adapter_model: IPAdapter_SDXL_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
control_image: ImageRef
control_model: StableDiffusionXLControlNetModel
controlnet_conditioning_scale: float

## StableDiffusionXLImg2Img

Transforms existing images based on text prompts using Stable Diffusion XL.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering stock photos for unique marketing materials
- Transforming rough sketches into detailed illustrations
- Creating variations of existing artwork or designs

**Fields:**
model: StableDiffusionXLModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
scheduler: StableDiffusionScheduler
lora_model: LORA_SDXL_Model
lora_scale: float
ip_adapter_model: IPAdapter_SDXL_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
init_image: ImageRef
strength: float

## StableDiffusionXLInpainting

Performs inpainting on images using Stable Diffusion XL.

Use cases:
- Removing unwanted objects from images
- Adding new elements to existing images
- Repairing damaged or incomplete images
- Creating creative image edits and modifications

**Fields:**
model: StableDiffusionXLModelId
prompt: str
negative_prompt: str
seed: int
num_inference_steps: int
guidance_scale: float
width: int
height: int
scheduler: StableDiffusionScheduler
lora_model: LORA_SDXL_Model
lora_scale: float
ip_adapter_model: IPAdapter_SDXL_Model
ip_adapter_image: ImageRef
ip_adapter_scale: float
image: ImageRef
mask_image: ImageRef
strength: float

## StableDiffusionXLModelId

An enumeration.

## Swin2SR

Performs image super-resolution using the Swin2SR model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Upscale images for better detail

**Fields:**
inputs: ImageRef
prompt: str

## VisualizeObjectDetection

Visualizes object detection results on images.

**Fields:**
image: ImageRef
objects: list

## VisualizeSegmentation

Visualizes segmentation masks on images with labels.

Use cases:
- Visualize results of image segmentation models
- Analyze and compare different segmentation techniques
- Create labeled images for presentations or reports

**Fields:**
image: ImageRef
segments: list

## ZeroShotImageClassifier

Classifies images into categories without the need for training data.

Use cases:
- Quickly categorize images without training data
- Identify objects in images without predefined labels
- Automate image tagging for large datasets

**Fields:**
model: ZeroShotImageClassifierModelId
inputs: ImageRef
candidate_labels: str

## ZeroShotObjectDetection

Detects objects in images without the need for training data.

Use cases:
- Quickly detect objects in images without training data
- Identify objects in images without predefined labels
- Automate object detection for large datasets

**Fields:**
model: ZeroShotObjectDetectionModelId
inputs: ImageRef
threshold: float
top_k: int
candidate_labels: str

### get_scheduler_class

**Args:**
- **scheduler (StableDiffusionScheduler)**

### make_hint

**Args:**
- **image (Image)**

**Returns:** Tensor

