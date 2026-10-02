---
layout: page
title: "Movie Posters"
---

## Overview

A poster generator. An art-direction step writes a creative strategy, then an image model renders one poster per concept.

**How it works:**
1. **Inputs** - Three `StringInput` nodes: Movie Title, Genre, and Visual Style.
2. **Strategy prompt** (`nodetool.text.Prompt`) - Frames the art-director brief from the three inputs.
3. **Structured output** (`nodetool.generators.StructuredOutputGenerator`) - Returns four fields: `positioning`, `audience_insight`, `design`, and `core_visual_concept`.
4. **Concept list** (`nodetool.text.Prompt` into `nodetool.generators.ListGenerator`) - Writes one line per poster concept, using the title, genre, positioning, and audience insight. Each line streams out as `item`.
5. **Poster prompt** (`nodetool.text.Prompt`) - Combines each concept with the genre, title, design, and core visual concept.
6. **Image generator** (`nodetool.image.TextToImage`) - Renders each poster at 3:4 and 2K. The template selects `fal-ai/flux/schnell`.
7. **Output** - The `Poster` output receives each rendered poster.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/movie-poster.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/movie-poster.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

start, image, example

## Workflow Diagram

{% mermaid %}
graph TD
  title["StringInput (Movie Title)"]
  genre["StringInput (Genre)"]
  style["StringInput (Visual Style)"]
  strategyPrompt["Prompt (strategy)"]
  strategy["StructuredOutputGenerator"]
  pitch["Prompt (concepts)"]
  list["ListGenerator"]
  posterPrompt["Prompt (poster)"]
  image["TextToImage"]
  out["Output (Poster)"]
  title --> strategyPrompt
  genre --> strategyPrompt
  style --> strategyPrompt
  strategyPrompt --> strategy
  strategy -->|positioning, audience_insight| pitch
  title --> pitch
  genre --> pitch
  pitch --> list
  list -->|item| posterPrompt
  strategy -->|design, core_visual_concept| posterPrompt
  title --> posterPrompt
  genre --> posterPrompt
  posterPrompt --> image --> out
{% endmermaid %}

## How to Use

1. Open NodeTool, click **Examples** in the app menu, and load "Movie Posters"
2. Fill in your movie details:
   - **Movie Title**: "Singularity" (or your movie name)
   - **Genre**: "Sci-Fi Thriller" (choose any genre)
   - **Visual Style**: "Neo-noir, high-contrast, cinematic"
3. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
4. View the posters in the Poster output

**Tips:**
- Try different genres for the same title to see how styles change
- Be specific about the visual style to get more targeted designs

## Next Steps

- [Image Enhance](image-enhance.md) - Enhance your poster designs
- [Creative Story Ideas](creative-story-ideas.md) - Generate movie concepts
