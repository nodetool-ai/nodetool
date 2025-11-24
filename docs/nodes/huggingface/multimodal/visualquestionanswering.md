---
layout: page
title: "Visual Question Answering"
node_type: "huggingface.multimodal.VisualQuestionAnswering"
namespace: "huggingface.multimodal"
---

**Type:** `huggingface.multimodal.VisualQuestionAnswering`

**Namespace:** `huggingface.multimodal`

## Description

Answers questions about images.
    image, text, question answering, multimodal

    Use cases:
    - Image content analysis
    - Automated image captioning
    - Visual information retrieval
    - Accessibility tools for visually impaired users

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.visual_question_answering` | The model ID to use for visual question answering | `{'type': 'hf.visual_question_answering', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The image to analyze | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| question | `str` | The question to be answered about the image | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.multimodal](../) namespace.

