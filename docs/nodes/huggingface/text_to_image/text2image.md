---
layout: page
title: "Text to Image"
node_type: "huggingface.text_to_image.Text2Image"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.Text2Image`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images from text prompts using AutoPipeline for automatic pipeline selection.
    image, generation, AI, text-to-image, auto

    Use cases:
    - Automatic selection of the best pipeline for a given model
    - Flexible image generation without pipeline-specific knowledge
    - Quick prototyping with various text-to-image models
    - Streamlined workflow for different model architectures

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use for text-to-image generation. | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | A text prompt describing the desired image. | `A cat holding a sign that says hello world` |
| negative_prompt | `any` | A text prompt describing what to avoid in the image. | `` |
| num_inference_steps | `any` | The number of denoising steps. | `50` |
| guidance_scale | `any` | The scale for classifier-free guidance. | `7.5` |
| width | `any` | The width of the generated image. | `512` |
| height | `any` | The height of the generated image. | `512` |
| pag_scale | `any` | Scale of the Perturbed-Attention Guidance applied to the image. | `3.0` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `any` |  |
| latent | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

