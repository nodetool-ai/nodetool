---
layout: page
title: "Creative Story Ideas"
---

## Overview

A beginner workflow that fills a prompt from three inputs and streams story ideas one at a time.

> This tutorial does not ship as an importable template. Build it manually by following the steps below.

**How it works:**
1. **Set inputs** - Three `nodetool.input.StringInput` nodes: Genre, Character Type, and Setting.
2. **Fill a prompt** - A `nodetool.text.Prompt` node holds text such as {% raw %}`Give five one-line story ideas in the {{ genre }} genre featuring {{ character }}.`{% endraw %} Each {% raw %}`{{ name }}`{% endraw %} becomes an input on the node that you connect to a `StringInput`.
3. **Generate ideas** - A `nodetool.generators.ListGenerator` sends the prompt to the language model you select and streams one idea per item.

**Key concepts:**
- Connect nodes to create workflows
- A Prompt node turns {% raw %}`{{ variables }}`{% endraw %} into inputs, so one wording serves many runs
- `ListGenerator` streams its `item` output, so downstream nodes start before the list is complete

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/creative-story-ideas.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/creative-story-ideas.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

start, beginner, tutorial, creative, writing

## Workflow Diagram

{% mermaid %}
graph TD
  genre["StringInput (Genre)"]
  character["StringInput (Character Type)"]
  setting["StringInput (Setting)"]
  prompt["Prompt"]
  ideas["ListGenerator"]
  genre -->|genre| prompt
  character -->|character| prompt
  setting -->|setting| prompt
  prompt --> ideas
{% endmermaid %}

## How to Use

1. Add the nodes above and connect them as in the diagram
2. Select a language model on the ListGenerator node
3. Fill in the input nodes:
   - **Genre**: "Sci-fi", "Fantasy", "Mystery", etc.
   - **Character Type**: "Hero", "Villain", "Detective", etc.
   - **Setting**: "Space station", "Medieval castle", "Future city", etc.
4. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
5. Add a Preview node on the `item` output to watch the ideas arrive

**Tips:**
- Run multiple times to get different ideas
- Try unusual combinations for unique results

## Next Steps

- [Movie Posters](movie-posters.md) - Generate images from ideas
- [Image Enhance](image-enhance.md) - Chain image transformations
