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
| model | `hf.translation` | The model ID to use for translation | `{'type': 'hf.translation', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `str` | The text to translate | `` |
| source_lang | `Enum['ar', 'bn', 'bs', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'fil', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'ms', 'me', 'no', 'pl', 'pt', 'pa', 'ru', 'ro', 'sr', 'sk', 'sl', 'es', 'sv', 'th', 'tr', 'vi']` | The source language code (e.g., 'en' for English) | `en` |
| target_lang | `Enum['ar', 'bn', 'bs', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'fil', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'ms', 'me', 'no', 'pl', 'pt', 'pa', 'ru', 'ro', 'sr', 'sk', 'sl', 'es', 'sv', 'th', 'tr', 'vi']` | The target language code (e.g., 'fr' for French) | `fr` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.translation](../) namespace.

