---
layout: page
title: "Creative Story Ideas"
---

## Overview

A beginner-friendly template for combining inputs with an AI agent to generate creative story ideas.

**How it works:**
1. **Set inputs** - Define genre, character type, and setting
2. **Format template** - Combine inputs into a prompt
3. **Generate ideas** - AI produces multiple story concepts

**Key concepts:**
- Connect nodes to create workflows
- Use templates with {{VARIABLES}} for dynamic prompts
- AI agents process inputs and generate results

## Tags

start, beginner, tutorial, template, creative, writing

## Workflow Diagram

{% mermaid %}
graph TD
  genre_input_["Genre"]
  character_type_input_["Character Type"]
  setting_input_["Setting"]
  string_templa["String"]
  formattext_format["FormatText"]
  listgenerator_list_g["ListGenerator"]
  genre_input_ --> formattext_format
  character_type_input_ --> formattext_format
  setting_input_ --> formattext_format
  string_templa --> formattext_format
  formattext_format --> listgenerator_list_g
{% endmermaid %}

## How to Use

1. Open NodeTool and find "Creative Story Ideas" in Templates
2. Click each input node to set your preferences:
   - **Genre**: "Sci-fi", "Fantasy", "Mystery", etc.
   - **Character Type**: "Hero", "Villain", "Detective", etc.
   - **Setting**: "Space station", "Medieval castle", "Future city", etc.
3. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
4. View the generated ideas in the Preview node

**Tips:**
- Run multiple times to get different ideas
- Try unusual combinations for unique results

## Next Steps

- [Movie Posters](movie-posters.md) - Generate images from ideas
- [Image Enhance](image-enhance.md) - Chain image transformations
- [Story to Video](story-to-video-generator.md) - Create video from stories
