---
layout: page
title: "NodeTool Workflow Cookbook"
description: "Reusable workflow patterns for the NodeTool canvas — core concepts, pipeline patterns, and worked end-to-end examples."
---

Workflow patterns for the canvas.

## Cookbook Sections

1. [**Core Concepts & Architecture**]({{ '/cookbook/core-concepts' | relative_url }}) — DAG structure, streaming execution, and node types.
2. [**Workflow Patterns**]({{ '/cookbook/patterns' | relative_url }}) — 13 common workflow patterns with diagrams and use cases.

## Detailed Workflow Examples

Step-by-step guides with diagrams are on the [Workflow Examples Gallery]({{ '/workflows/' | relative_url }}).

Highlights:

- [Movie Posters]({{ '/workflows/movie-posters' | relative_url }}) — Multi-stage AI generation
- [Story to Video Generator]({{ '/workflows/story-to-video-generator' | relative_url }}) — Prompt → storyboard → animated scenes
- [Image to Audio Story]({{ '/workflows/image-to-audio-story' | relative_url }}) — Picture in, narrated story out
- [Creative Story Ideas]({{ '/workflows/creative-story-ideas' | relative_url }}) — Beginner tutorial
- [Image Enhance]({{ '/workflows/image-enhance' | relative_url }}) — Basic image enhancement
- [Chat with Docs]({{ '/workflows/chat-with-docs' | relative_url }}) — RAG-based document Q&A

## Quick Reference: Choose Your Pattern

| I want to… | Pattern | Key nodes |
|------------|---------|-----------|
| Generate creative content | 2 (Agent-Driven Generation) | `Agent`, `ListGenerator`, image/audio generators |
| Transform images with AI | 8 (Advanced Image Processing) | `StableDiffusion`, `StableDiffusionXL`, `Canny`, `ImageToText` |
| Generate videos from text | 9 (Text-to-Video) | `KlingVideoV16ProTextToVideo`, `MinimaxHailuo23ProTextToVideo`, `Sora2TextToVideo` |
| Animate images to video | 10 (Image-to-Video) | `KlingVideoV16StandardImageToVideo`, `MinimaxHailuo02ProImageToVideo`, `SeeDanceV15ProImageToVideo`, `WanV225bImageToVideo` |
| Create talking avatars | 11 (Talking Avatar) | `KlingVideoAiAvatarV2Pro`, `Infinitalk` |
| Enhance image quality | 12 (Image Enhancement) | `TopazUpscaleImage` |
| Process emails automatically | 6 (Email Integration) | `GmailSearch`, `Template`, `Classifier`/`Summarizer` |
| Store data persistently | 5 (Database Persistence) | `CreateTable`, `Insert`, `Query` |
| Answer questions about documents | 4 (RAG) | `IndexTextChunk`, `HybridSearch`, `Agent` |
