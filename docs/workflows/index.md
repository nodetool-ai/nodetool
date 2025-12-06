---
layout: page
title: "Workflow Examples"
---

Explore pre-built NodeTool workflow examples to learn concepts and jumpstart your projects. Each example includes a detailed explanation and visual diagram. For the underlying design patterns, pair these with the [Workflow Patterns]({{ '/cookbook/patterns' | relative_url }}):

- RAG-heavy flows → [Pattern 4: RAG]({{ '/cookbook/patterns' | relative_url }}#pattern-4-rag-retrieval-augmented-generation)
- Streaming/agents → [Pattern 2: Agent-Driven Generation]({{ '/cookbook/patterns' | relative_url }}#pattern-2-agent-driven-generation) and [Pattern 3: Streaming with Multiple Previews]({{ '/cookbook/patterns' | relative_url }}#pattern-3-streaming-with-multiple-previews)
- Data pipelines → [Pattern 9: Advanced Image Processing]({{ '/cookbook/patterns' | relative_url }}#pattern-9-advanced-image-processing) and [Pattern 10: Data Processing Pipeline]({{ '/cookbook/patterns' | relative_url }}#pattern-10-data-processing-pipeline)

## Getting Started Workflows

These beginner-friendly workflows help you learn NodeTool fundamentals:

- [Creative Story Ideas](creative-story-ideas.md) - Learn inputs, templates, LLM agents, and streaming
- [Transcribe Audio](transcribe-audio.md) - Convert speech to text using Whisper
- [Image Enhance](image-enhance.md) - Basic image enhancement with sharpening and contrast

## Audio Workflows

- [Transcribe Audio](transcribe-audio.md) - Speech-to-text conversion with word-level timestamps
- [Image To Audio Story](image-to-audio-story.md) - Generate audio stories from images

## Image & Video Workflows

- [Image Enhance](image-enhance.md) - Sharpen, contrast, and color adjustment
- [Movie Posters](movie-posters.md) - Generate movie poster designs
- [Color Boost Video](color-boost-video.md) - Enhance video colors frame by frame
- [Story to Video Generator](story-to-video-generator.md) - Convert stories into videos

## Document Processing

- [Chat with Docs](chat-with-docs.md) - RAG-based document Q&A system
- [Index PDFs](index-pdfs.md) - Index PDF documents for search
- [Fetch Papers](fetch-papers.md) - Retrieve and process research papers
- [Summarize Paper](summarize-paper.md) - Automatic research paper summarization
- [Flashcard Generator](flashcard-generator.md) - Generate study flashcards from documents

## Data & Analysis

- [Data Generator](data-generator.md) - Generate synthetic data
- [Data Visualization Pipeline](data-visualization-pipeline.md) - Create data visualizations

## Automation & Productivity

- [Categorize Mails](categorize-mails.md) - Automatically categorize emails
- [Meeting Transcript Summarizer](meeting-transcript-summarizer.md) - Summarize meeting transcripts
- [Summarize Newsletters](summarize-newsletters.md) - Extract key points from newsletters
- [Summarize RSS](summarize-rss.md) - Summarize RSS feed content
- [Realtime Agent](realtime-agent.md) - Real-time AI agent workflows

## All Workflows (Alphabetical)

{% assign workflow_pages = site.pages | where_exp: "page", "page.path contains 'workflows/'" | where_exp: "page", "page.title != 'Workflow Examples'" | sort: "title" %}

{% for page in workflow_pages %}
- [{{ page.title }}]({{ page.url | relative_url }})
{% endfor %}

## How to Import Workflows

1. Open NodeTool desktop application
2. Click **Templates** in the dashboard
3. Browse and select any example workflow
4. Click to open and start customizing

You can also build these workflows manually by following the diagrams on each example page.

## Contributing

Have a great workflow to share? Contribute to the [NodeTool repository](https://github.com/nodetool-ai/nodetool) by adding your workflow to the examples directory.
