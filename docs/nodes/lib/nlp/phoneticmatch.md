---
layout: page
title: "Phonetic Match"
node_type: "lib.nlp.PhoneticMatch"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.PhoneticMatch`

**Namespace:** `lib.nlp`

## Description

Computes phonetic codes for words using Soundex, Metaphone, or Double Metaphone.
    phonetics, soundex, metaphone, fuzzy matching, NLP

    Use cases:
    - Find words that sound alike
    - Build fuzzy name matching systems
    - Implement spell correction suggestions
    - Match names with different spellings

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text containing words to compute phonetic codes for | `` |
| algorithm | `enum` | Phonetic algorithm to use | `metaphone` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| tokens | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
