# nodetool.nodes.huggingface.image

## AuraFlowNode

Generates images using the AuraFlow pipeline.

Use cases:
- Create unique images from text descriptions
- Generate illustrations for creative projects
- Produce visual content for digital media

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## DepthEstimation

Estimates depth from a single image.

Use cases:
- Generate depth maps for 3D modeling
- Assist in augmented reality applications
- Enhance computer vision systems for robotics
- Improve scene understanding in autonomous vehicles

**Tags:** image, depth estimation, 3D, huggingface

- **model**: The model ID to use for depth estimation (DepthEstimationModelId)
- **inputs**: The input image for depth estimation (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

## ImageClassifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images
- Visual quality control in manufacturing to identify defective products
- Medical image analysis to assist in diagnosing conditions

**Tags:** image, classification, labeling, categorization

- **model**: The model ID to use for the classification (ImageClassifierModelId)
- **inputs**: The input image to classify (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## ImageToImage

Performs image-to-image transformation tasks.

Use cases:
- Style transfer
- Image inpainting
- Image super-resolution
- Image colorization

**Tags:** image, transformation, generation, huggingface

- **model**: The model ID to use for the image-to-image transformation (ImageToImageModelId)
- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

## Kandinsky2Node

Generates images using the Kandinsky 2.2 model. Provide image for img2img mode.

Use cases:
- Create high-quality images from text descriptions
- Transform existing images based on text prompts
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art

**Tags:** image, generation, AI, text-to-image, image-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **image**: The input image to transform (optional) (ImageRef)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## Kandinsky3Node

Generates images using the Kandinsky-3 model. Provide image for img2img mode.

Use cases:
- Create detailed images from text descriptions
- Generate unique illustrations for creative projects
- Produce visual content for digital media and art

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **image**: The input image to transform (optional) (ImageRef)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## ObjectDetection

Detects and localizes objects in images.

Use cases:
- Identify and count objects in images
- Locate specific items in complex scenes
- Assist in autonomous vehicle vision systems
- Enhance security camera footage analysis

**Tags:** image, object detection, bounding boxes, huggingface

- **model**: The model ID to use for object detection (ObjectDetectionModelId)
- **inputs**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

## SDXLTurbo

- **prompt**: The prompt for image generation. (str)
- **init_image**: The initial image for Image-to-Image generation (optional). (ImageRef)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **strength**: Strength for Image-to-Image generation. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## Segmentation

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

**Tags:** image, segmentation, object detection, scene parsing

- **model**: The model ID to use for the segmentation (SegmentationModelId)
- **image**: The input image to segment (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## StableCascadeNode

Generates images using the Stable Cascade model, which involves a two-stage process with a prior and a decoder.

Use cases:
- Create high-quality images from text descriptions
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **prior_num_inference_steps**: The number of denoising steps for the prior. (int)
- **decoder_num_inference_steps**: The number of denoising steps for the decoder. (int)
- **prior_guidance_scale**: Guidance scale for the prior. (float)
- **decoder_guidance_scale**: Guidance scale for the decoder. (float)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## ZeroShotImageClassifier

Classifies images into categories without the need for training data.

Use cases:
- Quickly categorize images without training data
- Identify objects in images without predefined labels
- Automate image tagging for large datasets

**Tags:** image, classification, labeling, categorization

- **model**: The model ID to use for the classification (ZeroShotImageClassifierModelId)
- **inputs**: The input image to classify (ImageRef)
- **candidate_labels**: The candidate labels to classify the image against, separated by commas (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## ZeroShotObjectDetection

Detects objects in images without the need for training data.

Use cases:
- Quickly detect objects in images without training data
- Identify objects in images without predefined labels
- Automate object detection for large datasets

**Tags:** image, object detection, bounding boxes, zero-shot

- **model**: The model ID to use for object detection (ZeroShotObjectDetectionModelId)
- **inputs**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)
- **candidate_labels**: The candidate labels to detect in the image, separated by commas (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

