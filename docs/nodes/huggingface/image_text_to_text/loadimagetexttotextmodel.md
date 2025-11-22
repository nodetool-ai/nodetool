---
layout: page
title: "Load Image Text To Text Model"
node_type: "huggingface.image_text_to_text.LoadImageTextToTextModel"
namespace: "huggingface.image_text_to_text"
---

**Type:** `huggingface.image_text_to_text.LoadImageTextToTextModel`

**Namespace:** `huggingface.image_text_to_text`

## Description

Load a Hugging Face image-text-to-text model/pipeline by repo_id.

    Use cases:
    - Produces a configurable `HFImageTextToText` model reference for downstream nodes
    - Ensures the selected model can be loaded with the "image-text-to-text" task

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| repo_id | `any` | The model repository ID to use for image-text-to-text generation. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_text_to_text](../) namespace.

