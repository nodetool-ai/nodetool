---
layout: page
title: "NodeTool Workflow Cookbook"
description: "Reusable workflow patterns for the NodeTool canvas — core concepts, pipeline patterns, and worked end-to-end examples."
---

Reusable patterns for building on the NodeTool canvas. Start with a pattern that
matches what you want to build, then adapt one of the worked examples.

## Cookbook Sections

1. [**Core Concepts & Architecture**]({{ '/cookbook/core-concepts' | relative_url }}) — how graphs, typed edges, streaming, and node types work.
2. [**Workflow Patterns**]({{ '/cookbook/patterns' | relative_url }}) — 13 patterns with diagrams and the nodes each one uses.
3. [**Workflow Gallery**]({{ '/workflows/' | relative_url }}) — step-by-step example workflows you can open and run.

New to the canvas? Read [Core Concepts]({{ '/cookbook/core-concepts' | relative_url }})
first, then follow a beginner example like
[Creative Story Ideas]({{ '/workflows/creative-story-ideas' | relative_url }}).

## Choose Your Pattern

| I want to… | Pattern | Key nodes |
|------------|---------|-----------|
| Transform one input step by step | [1 · Simple Pipeline]({{ '/cookbook/patterns' | relative_url }}#pattern-1-simple-pipeline) | `ImageInput`, `UnsharpMask`, `AutoContrast` |
| Generate content with an LLM | [2 · Agent-Driven Generation]({{ '/cookbook/patterns' | relative_url }}#pattern-2-agent-driven-generation) | `Agent`, `ListGenerator`, `TextToSpeech` |
| Show progress during a long run | [3 · Streaming with Previews]({{ '/cookbook/patterns' | relative_url }}#pattern-3-streaming-with-multiple-previews) | `Agent`, `ListGenerator`, `Preview` |
| Answer questions about documents | [4 · RAG]({{ '/cookbook/patterns' | relative_url }}#pattern-4-rag-retrieval-augmented-generation) | `HybridSearch`, `FormatText`, `Agent` |
| Store data persistently | [5 · Database Persistence]({{ '/cookbook/patterns' | relative_url }}#pattern-5-database-persistence) | `CreateTable`, `Insert`, `Query` |
| Process emails or web content | [6 · Email & Web Integration]({{ '/cookbook/patterns' | relative_url }}#pattern-6-email--web-integration) | `GmailSearch`, `Template`, `Summarizer` |
| Convert between media types | [7 · Multi-Modal Workflows]({{ '/cookbook/patterns' | relative_url }}#pattern-7-multi-modal-workflows) | `Whisper`, `StableDiffusion`, `TextToSpeech` |
| Transform images with AI | [8 · Advanced Image Processing]({{ '/cookbook/patterns' | relative_url }}#pattern-8-advanced-image-processing) | `StableDiffusionV3MediumImageToImage`, `ImageToText`, `Canny` |
| Generate video from text | [9 · Text-to-Video]({{ '/cookbook/patterns' | relative_url }}#pattern-9-text-to-video) | `KlingVideoV16ProTextToVideo`, `Sora2TextToVideo` |
| Animate an image into video | [10 · Image-to-Video]({{ '/cookbook/patterns' | relative_url }}#pattern-10-image-to-video) | `KlingVideoV16StandardImageToVideo`, `SeeDanceV15ProImageToVideo` |
| Create a lip-synced avatar | [11 · Talking Avatar]({{ '/cookbook/patterns' | relative_url }}#pattern-11-talking-avatar) | `KlingVideoAiAvatarV2Pro`, `Infinitalk` |
| Upscale and clean up images | [12 · Image Enhancement]({{ '/cookbook/patterns' | relative_url }}#pattern-12-video-enhancement) | `TopazUpscaleImage` |
| Turn keyframes into a video | [13 · Storyboard to Video]({{ '/cookbook/patterns' | relative_url }}#pattern-13-storyboard-to-video) | `Sora2ImageToVideoPro` |

## Worked Examples

Full walkthroughs with diagrams live in the
[Workflow Gallery]({{ '/workflows/' | relative_url }}). A few to start with:

- [Creative Story Ideas]({{ '/workflows/creative-story-ideas' | relative_url }}) — beginner tutorial for agent generation.
- [Image Enhance]({{ '/workflows/image-enhance' | relative_url }}) — a simple sharpen-and-contrast pipeline.
- [Movie Posters]({{ '/workflows/movie-posters' | relative_url }}) — multi-stage generation with strategy and previews.
- [Story to Video Generator]({{ '/workflows/story-to-video-generator' | relative_url }}) — prompt → storyboard → animated scenes.
- [Image to Audio Story]({{ '/workflows/image-to-audio-story' | relative_url }}) — picture in, narrated story out.
- [Chat with Docs]({{ '/workflows/chat-with-docs' | relative_url }}) — RAG document Q&A.

## Build Any Example

- Press **Space** to open the node menu and add a node.
- Drag from an output handle to an input handle to connect nodes.
- Press **Ctrl/⌘ + Enter** to run.
- Add **Preview** nodes to inspect intermediate results.
