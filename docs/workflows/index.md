---
layout: page
title: "Workflow Gallery"
---

Small workflows with a node-by-node walkthrough and a diagram. Most load from the **Examples** page. Categorize Mails, Creative Story Ideas, Fetch Papers, and Summarize RSS do not ship as templates, and each says so at the top.

For the flagship, end-to-end showcases, see
[Use Cases]({{ '/use-cases' | relative_url }}). See
[Workflow Patterns]({{ '/cookbook/patterns' | relative_url }}) for reusable techniques.

## Start Here: Beginner-Friendly Workflows

Good starting points for learning NodeTool:

- [Creative Story Ideas](creative-story-ideas.md) - Generate story concepts and creative prompts
- [Image Enhance](image-enhance.md) - Polish photos with sharpening and auto-contrast
- [Transcribe Audio](transcribe-audio.md) - Convert speech to text with AI

## Visual Creation & Image Workflows

Create and transform images:

- [Movie Posters](movie-posters.md) - AI-generated poster designs from creative briefs
- [Image Enhance](image-enhance.md) - Image enhancement pipeline
- [Image To Audio Story](image-to-audio-story.md) - Turn images into narrated stories

## Video & Motion Workflows

Create and enhance video content:

- [Color Boost Video](color-boost-video.md) - AI-powered color enhancement for video

## Audio & Voice Workflows

Work with sound, music, and voice:

- [Transcribe Audio](transcribe-audio.md) - Speech-to-text with word-level timestamps
- [Image To Audio Story](image-to-audio-story.md) - Generate narrated stories from visuals

## Content Creation & Writing

Generate and transform written content:

- [Creative Story Ideas](creative-story-ideas.md) - Brainstorming for writers and creators
- [Flashcard Generator](flashcard-generator.md) - Turn content into study materials

## Document Workflows

Work with documents and knowledge:

- [Chat with Docs](chat-with-docs.md) - Ask questions about your documents with AI
- [Fetch Papers](fetch-papers.md) - Retrieve and process academic papers

## Productivity & Automation

Save time with these workflows:

- [Meeting Transcript Summarizer](meeting-transcript-summarizer.md) - Auto-summarize meetings
- [Categorize Mails](categorize-mails.md) - Organize emails automatically
- [Summarize RSS](summarize-rss.md) - Stay updated with feed summaries

## Data & Visualization

Generate and visualize data:

- [Data Generator](data-generator.md) - Create synthetic datasets

---

## All Workflows (Alphabetical)

{% assign workflow_pages = site.pages | where_exp: "page", "page.path contains 'workflows/'" | where_exp: "page", "page.title != 'Workflow Gallery'" | sort: "title" %}

{% for page in workflow_pages %}
- [{{ page.title }}]({{ page.url | relative_url }})
{% endfor %}

---

## How to Use These Workflows

**Option 1: Load from Examples**
1. Open NodeTool
2. Click **Examples** in the app menu
3. Click a workflow. NodeTool opens a private copy and leaves the original unchanged.
4. Run it with <kbd>Ctrl/⌘ + Enter</kbd>

**Option 2: Build manually**
1. Open a workflow page
2. Follow the diagram
3. Add nodes and connect them yourself

---

## Share Your Creations

Created a workflow? Share it on the [NodeTool repository](https://github.com/nodetool-ai/nodetool).
