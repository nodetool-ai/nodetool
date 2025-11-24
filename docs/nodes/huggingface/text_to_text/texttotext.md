---
layout: page
title: "Text To Text"
node_type: "huggingface.text_to_text.TextToText"
namespace: "huggingface.text_to_text"
---

**Type:** `huggingface.text_to_text.TextToText`

**Namespace:** `huggingface.text_to_text`

## Description

Performs text-to-text generation tasks.
    text, generation, translation, question-answering, summarization, nlp, natural-language-processing

    Use cases:
    - Text translation
    - Text summarization
    - Paraphrasing
    - Text style transfer

    Usage:
    Start with a command like Translate, Summarize, or Q (for question)
    Follow with the text you want to translate, summarize, or answer a question about.
    Examples:
    - Translate to German: Hello
    - Summarize: The quick brown fox jumps over the lazy dog.
    - Q: Who ate the cookie? followed by the text of the cookie monster.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text2text_generation` | The model ID to use for the text-to-text generation | `{'type': 'hf.text2text_generation', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| text | `str` | The input text for the text-to-text task | `` |
| max_length | `int` | The maximum length of the generated text | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_text](../) namespace.

