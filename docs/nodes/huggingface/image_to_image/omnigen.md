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
| prompt | `str` | The text prompt for image generation. Use <img><|image_1|></img> placeholders to reference input images. | `A realistic photo of a young woman sitting on a sofa, holding a book and facing the camera.` |
| input_images | `List[image]` | List of input images to use for editing or as reference. Referenced in prompt using <img><|image_1|></img>, <img><|image_2|></img>, etc. | `[]` |
| height | `int` | Height of the generated image. | `1024` |
| width | `int` | Width of the generated image. | `1024` |
| guidance_scale | `float` | Guidance scale for generation. Higher values follow the prompt more closely. | `2.5` |
| img_guidance_scale | `float` | Image guidance scale when using input images. | `1.6` |
| num_inference_steps | `int` | Number of denoising steps. | `25` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| use_input_image_size_as_output | `bool` | If True, use the input image size as output size. Recommended for image editing. | `False` |
| max_input_image_size | `int` | Maximum input image size. Smaller values reduce memory usage but may affect quality. | `1024` |
| enable_model_cpu_offload | `bool` | Enable CPU offload to reduce memory usage when using multiple images. | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

