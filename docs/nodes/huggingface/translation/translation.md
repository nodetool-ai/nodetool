---
layout: page
title: "Translation"
node_type: "huggingface.translation.Translation"
namespace: "huggingface.translation"
---

**Type:** `huggingface.translation.Translation`

**Namespace:** `huggingface.translation`

## Description

Translates text from one language to another.
    text, translation, natural language processing

    Use cases:
    - Multilingual content creation
    - Cross-language communication
    - Localization of applications and websites

    Note: some models support more languages than others.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for translation | `{'type': 'hf.translation', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `any` | The text to translate | `` |
| source_lang | `any` | The source language code (e.g., 'en' for English) | `en` |
| target_lang | `any` | The target language code (e.g., 'fr' for French) | `fr` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.translation](../) namespace.

