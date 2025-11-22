---
layout: page
title: "OmniGen"
node_type: "huggingface.image_to_image.OmniGen"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.OmniGen`

**Namespace:** `huggingface.image_to_image`

## Description

Generates and edits images using the OmniGen model, supporting multimodal inputs.
    image, generation, text-to-image, image-editing, multimodal, omnigen

    Use cases:
    - Generate images from text prompts
    - Edit existing images with text instructions
    - Controllable image generation with reference images
    - Visual reasoning and image manipulation
    - ID and object preserving generation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | The text prompt for image generation. Use <img><|image_1|></img> placeholders to reference input images. | `A realistic photo of a young woman sitting on a sofa, holding a book and facing the camera.` |
| input_images | `any` | List of input images to use for editing or as reference. Referenced in prompt using <img><|image_1|></img>, <img><|image_2|></img>, etc. | `[]` |
| height | `any` | Height of the generated image. | `1024` |
| width | `any` | Width of the generated image. | `1024` |
| guidance_scale | `any` | Guidance scale for generation. Higher values follow the prompt more closely. | `2.5` |
| img_guidance_scale | `any` | Image guidance scale when using input images. | `1.6` |
| num_inference_steps | `any` | Number of denoising steps. | `25` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| use_input_image_size_as_output | `any` | If True, use the input image size as output size. Recommended for image editing. | `False` |
| max_input_image_size | `any` | Maximum input image size. Smaller values reduce memory usage but may affect quality. | `1024` |
| enable_model_cpu_offload | `any` | Enable CPU offload to reduce memory usage when using multiple images. | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

