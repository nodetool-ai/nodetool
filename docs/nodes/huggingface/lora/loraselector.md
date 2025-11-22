---
layout: page
title: "LoRA Selector"
node_type: "huggingface.lora.LoRASelector"
namespace: "huggingface.lora"
---

**Type:** `huggingface.lora.LoRASelector`

**Namespace:** `huggingface.lora`

## Description

Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning, SD

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| lora1 | `any` | First LoRA model | `{'type': 'hf.lora_sd', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| strength1 | `any` | Strength for first LoRA | `1.0` |
| lora2 | `any` | Second LoRA model | `{'type': 'hf.lora_sd', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| strength2 | `any` | Strength for second LoRA | `1.0` |
| lora3 | `any` | Third LoRA model | `{'type': 'hf.lora_sd', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| strength3 | `any` | Strength for third LoRA | `1.0` |
| lora4 | `any` | Fourth LoRA model | `{'type': 'hf.lora_sd', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| strength4 | `any` | Strength for fourth LoRA | `1.0` |
| lora5 | `any` | Fifth LoRA model | `{'type': 'hf.lora_sd', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| strength5 | `any` | Strength for fifth LoRA | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.lora](../) namespace.

