---
layout: page
title: "Movie Posters"
---

## Overview

Create cinematic movie posters using AI image generation

**AI-Assisted Movie-Poster Generator**

****

•	Takes title, genre, and primary audience as inputs.

•	LLM #1 produces a brief poster-marketing strategy.

•	LLM #2 converts that strategy into multiple Stable-Diffusion prompts.

•	Stable Diffusion node renders 512 × 768 px poster concepts.

•	Preview panels display the strategy and a gallery of generated images.

## Tags

start, image

## Workflow Diagram

{% mermaid %}
graph TD
  agent_strate["Agent"]
  string_strate["String"]
  formattext_strate["FormatText"]
  movie_title_movie_["Movie Title"]
  genre_genre_["Genre"]
  primary_audience_audien["Primary Audience"]
  listgenerator_prompt["ListGenerator"]
  string_design["String"]
  texttoimage_d31191["TextToImage"]
  string_strate --> formattext_strate
  formattext_strate --> agent_strate
  agent_strate --> listgenerator_prompt
  string_design --> listgenerator_prompt
  primary_audience_audien --> formattext_strate
  movie_title_movie_ --> formattext_strate
  genre_genre_ --> formattext_strate
  listgenerator_prompt --> texttoimage_d31191
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
