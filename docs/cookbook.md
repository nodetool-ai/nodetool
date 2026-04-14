---
layout: page
title: "NodeTool Workflow Cookbook"
---

Guide for building AI workflows with NodeTool.

## Cookbook Sections

1. [**Core Concepts & Architecture**]({{ '/cookbook/core-concepts' | relative_url }}) — DAG structure, streaming execution, and node types.
2. [**Workflow Patterns**]({{ '/cookbook/patterns' | relative_url }}) — 15+ common workflow patterns with diagrams and use cases.

## Detailed Workflow Examples

Step-by-step guides with diagrams are on the [Workflow Examples Gallery]({{ '/workflows/' | relative_url }}).

Highlights:

- [Image Enhance]({{ '/workflows/image-enhance' | relative_url }}) — Basic image enhancement
- [Transcribe Audio]({{ '/workflows/transcribe-audio' | relative_url }}) — Speech-to-text with Whisper
- [Chat with Docs]({{ '/workflows/chat-with-docs' | relative_url }}) — RAG-based document Q&A
- [Creative Story Ideas]({{ '/workflows/creative-story-ideas' | relative_url }}) — Beginner tutorial
- [Movie Posters]({{ '/workflows/movie-posters' | relative_url }}) — Multi-stage AI generation
- [Data Visualization Pipeline]({{ '/workflows/data-visualization-pipeline' | relative_url }}) — Data fetching and charting

## Quick Reference: Choose Your Pattern

| I want to… | Pattern | Key nodes |
|------------|---------|-----------|
| Generate creative content | 2 (Agent-Driven Generation) | `Agent`, `ListGenerator`, image/audio generators |
| Answer questions about documents | 4 (RAG) | `IndexTextChunks`, `HybridSearch`, `Agent` |
| Process emails automatically | 6 (Email Integration) | `GmailSearch`, `EmailFields`, `Classifier`/`Summarizer` |
| Build a voice interface | 7 (Realtime Processing) | `RealtimeAudioInput`, `RealtimeAgent` |
| Store data persistently | 5 (Database Persistence) | `CreateTable`, `Insert`, `Query` |
| Transform images with AI | 9 (Advanced Image Processing) | `StableDiffusionControlNet`, `Canny`, `ImageToText` |
| Generate videos from text | 11 (Text-to-Video) | `KlingTextToVideo`, `HailuoTextToVideoPro`, `Sora2TextToVideo` |
| Animate images to video | 12 (Image-to-Video) | `KlingImageToVideo`, `HailuoImageToVideoPro`, `Wan26ImageToVideo` |
| Create talking avatars | 13 (Talking Avatar) | `KlingAIAvatarPro`, `KlingAIAvatarStandard`, `InfinitalkV1` |
| Enhance video quality | 14 (Video Enhancement) | `TopazVideoUpscale` |
| Convert storyboards to video | 15 (Storyboard to Video) | `Sora2ProStoryboard` |
| Fetch and visualize data | 10 (Data Processing Pipeline) | `GetRequest`, `ImportCSV`, `ChartGenerator` |
