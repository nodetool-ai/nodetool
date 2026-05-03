---
layout: page
title: "Movie Posters"
---

## Overview

An AI-powered poster generator: a strategy agent plans the visual concept, then an image model renders poster variations.

**How it works:**
1. **Input** - Movie title, genre, and target audience
2. **Strategy Agent** - Creates a marketing approach and visual concept
3. **Prompt Generator** - Converts strategy into image prompts for multiple variations
4. **Image Generator** - Renders 512×768px posters with Stable Diffusion/Flux
5. **Preview** - Shows the strategy and all generated posters

## Tags

start, image, creative, design, posters

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

1. Open NodeTool and find "Movie Posters" in Templates
2. Fill in your movie details:
   - **Movie Title**: "Quantum Horizon" (or your movie name)
   - **Genre**: "Sci-Fi Thriller" (choose any genre)
   - **Primary Audience**: "Adults 25-40 who love space mysteries"
3. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
4. View the AI strategy in the top preview, posters in the bottom gallery

**Tips:**
- Try different genres for the same title to see how styles change
- Be specific about audience to get more targeted designs

## Next Steps

- [Image Enhance](image-enhance.md) - Enhance your poster designs
- [Creative Story Ideas](creative-story-ideas.md) - Generate movie concepts
- [Story to Video](story-to-video-generator.md) - Create video trailers
