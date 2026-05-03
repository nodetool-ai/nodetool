---
layout: page
title: "Sentiment Analysis"
node_type: "lib.nlp.SentimentAnalysis"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.SentimentAnalysis`

**Namespace:** `lib.nlp`

## Description

Analyzes sentiment of text using natural's SentimentAnalyzer.
    sentiment, opinion, polarity, text analysis, NLP

    Use cases:
    - Determine positive or negative tone of text
    - Analyze customer feedback sentiment
    - Score product reviews
    - Monitor social media sentiment

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to analyze for sentiment | `` |
| language | `enum` | Language of the input text | `English` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| score | `float` |  |
| comparative | `float` |  |
| positive_words | `list` |  |
| negative_words | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
