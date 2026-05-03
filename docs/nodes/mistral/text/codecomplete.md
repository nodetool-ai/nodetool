---
layout: page
title: "Code Complete"
node_type: "mistral.text.CodeComplete"
namespace: "mistral.text"
---

**Type:** `mistral.text.CodeComplete`

**Namespace:** `mistral.text`

## Description

Generate code using Mistral AI's Codestral model.
    mistral, code, codestral, ai, programming, completion

    Uses Mistral AI's Codestral model specifically designed for code generation.
    Supports fill-in-the-middle (FIM) for code completion tasks.
    Requires a Mistral API key.

    Use cases:
    - Generate code from natural language descriptions
    - Complete partial code snippets
    - Fill in code between prefix and suffix
    - Automated code generation for various programming languages

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The prompt or code prefix for generation | `` |
| suffix | `str` | Optional suffix for fill-in-the-middle completion | `` |
| temperature | `float` | Sampling temperature. Lower values for code generation. | `0` |
| max_tokens | `int` | Maximum number of tokens to generate | `2048` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [mistral.text](../) namespace.
