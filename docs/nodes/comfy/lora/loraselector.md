---
layout: page
title: "Lo RASelector"
node_type: "comfy.lora.LoRASelector"
namespace: "comfy.lora"
---

**Type:** `comfy.lora.LoRASelector`

**Namespace:** `comfy.lora`

## Description

Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| lora1 | `Optional[comfy.lora_file]` | First LoRA model | `{'type': 'comfy.lora_file', 'name': ''}` |
| strength1 | `Optional[float]` | Strength for first LoRA | `1.0` |
| lora2 | `Optional[comfy.lora_file]` | Second LoRA model | `{'type': 'comfy.lora_file', 'name': ''}` |
| strength2 | `Optional[float]` | Strength for second LoRA | `1.0` |
| lora3 | `Optional[comfy.lora_file]` | Third LoRA model | `{'type': 'comfy.lora_file', 'name': ''}` |
| strength3 | `Optional[float]` | Strength for third LoRA | `1.0` |
| lora4 | `Optional[comfy.lora_file]` | Fourth LoRA model | `{'type': 'comfy.lora_file', 'name': ''}` |
| strength4 | `Optional[float]` | Strength for fourth LoRA | `1.0` |
| lora5 | `Optional[comfy.lora_file]` | Fifth LoRA model | `{'type': 'comfy.lora_file', 'name': ''}` |
| strength5 | `Optional[float]` | Strength for fifth LoRA | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[comfy.lora_config]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.lora](../) namespace.

