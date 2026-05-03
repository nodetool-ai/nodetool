---
layout: page
title: "Classify Text"
node_type: "lib.nlp.ClassifyText"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.ClassifyText`

**Namespace:** `lib.nlp`

## Description

Trains a Naive Bayes classifier and classifies text.
    classify, categorize, naive bayes, machine learning, NLP

    Use cases:
    - Categorize text into predefined labels
    - Build simple spam detection
    - Classify customer support tickets
    - Sort documents by topic

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to classify | `` |
| training_data | `list` | Array of {text, label} objects for training the classifier | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| classifications | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
