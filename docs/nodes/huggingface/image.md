# nodetool.nodes.huggingface.image

## Classifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images
- Visual quality control in manufacturing to identify defective products
- Medical image analysis to assist in diagnosing conditions

**Tags:** image, classification, labeling, categorization

- **model**: The model ID to use for the classification (ModelId)
- **image**: The input image to classify (ImageRef)

## Segformer

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

**Tags:** image, segmentation, object detection, scene parsing

- **image**: The input image to segment (ImageRef)

## StableDiffusionXL

Generates images from text prompts using advanced diffusion models.

Use cases:
- Creating custom illustrations for marketing materials
- Generating concept art for game and film development
- Producing unique stock imagery for websites and publications
- Visualizing interior design concepts for clients

**Tags:** image, text, generation, synthesis, text-to-image

- **model**: The model ID to use for the image generation (ModelId)
- **inputs**: The input text to the model (str)
- **negative_prompt**: The negative prompt to use. (str)
- **seed** (int)
- **guidance_scale** (float)
- **num_inference_steps** (int)
- **width** (int)
- **height** (int)
- **scheduler** (Scheduler)

