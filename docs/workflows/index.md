---
layout: page
title: "Workflow Gallery"
---

Ready-to-use workflow examples. Each includes explanations and visual diagrams.

See [Workflow Patterns]({{ '/cookbook/patterns' | relative_url }}) for reusable techniques.

## 🎨 Start Here: Beginner-Friendly Workflows

Good starting points for learning NodeTool:

- [Creative Story Ideas](creative-story-ideas.md) - Generate story concepts and creative prompts
- [Image Enhance](image-enhance.md) - Polish photos with sharpening and auto-contrast
- [Transcribe Audio](transcribe-audio.md) - Convert speech to text with AI

## 🖼️ Visual Creation & Image Workflows

Create and transform images:

- [Movie Posters](movie-posters.md) - AI-generated poster designs from creative briefs
- [Image Enhance](image-enhance.md) - Image enhancement pipeline
- [Image To Audio Story](image-to-audio-story.md) - Turn images into narrated stories

## 🎬 Video & Motion Workflows

Create and enhance video content:

- [Color Boost Video](color-boost-video.md) - AI-powered color enhancement for video
- [Story to Video Generator](story-to-video-generator.md) - Transform stories into visual videos

## 🎵 Audio & Voice Workflows

Work with sound, music, and voice:

- [Transcribe Audio](transcribe-audio.md) - Speech-to-text with word-level timestamps
- [Image To Audio Story](image-to-audio-story.md) - Generate narrated stories from visuals

## ✍️ Content Creation & Writing

Generate and transform written content:

- [Creative Story Ideas](creative-story-ideas.md) - Brainstorming for writers and creators
- [Flashcard Generator](flashcard-generator.md) - Turn content into study materials
- [Story to Video Generator](story-to-video-generator.md) - Bring written stories to life

## 📚 Document Workflows

Work with documents and knowledge:

- [Chat with Docs](chat-with-docs.md) - Ask questions about your documents with AI
- [Index PDFs](index-pdfs.md) - Make documents searchable
- [Summarize Paper](summarize-paper.md) - Quick summaries of research papers
- [Fetch Papers](fetch-papers.md) - Retrieve and process academic papers

## 🤖 Productivity & Automation

Save time with these workflows:

- [Meeting Transcript Summarizer](meeting-transcript-summarizer.md) - Auto-summarize meetings
- [Categorize Mails](categorize-mails.md) - Organize emails automatically
- [Summarize Newsletters](summarize-newsletters.md) - Extract key newsletter insights
- [Summarize RSS](summarize-rss.md) - Stay updated with feed summaries
- [Realtime Agent](realtime-agent.md) - Real-time AI assistance

## 📊 Data & Visualization

Generate and visualize data:

- [Data Generator](data-generator.md) - Create synthetic datasets
- [Data Visualization Pipeline](data-visualization-pipeline.md) - Turn data into visuals

---

## All Workflows (Alphabetical)

{% assign workflow_pages = site.pages | where_exp: "page", "page.path contains 'workflows/'" | where_exp: "page", "page.title != 'Creative Workflow Gallery'" | sort: "title" %}

{% for page in workflow_pages %}
- [{{ page.title }}]({{ page.url | relative_url }})
{% endfor %}

---

## How to Use These Workflows

**Option 1: One-Click Import (Easiest)**
1. Open NodeTool
2. Click **Templates** in the dashboard
3. Browse and click any workflow
4. Start creating immediately!

**Option 2: Build Manually (Learning)**
1. View any workflow page
2. Follow the visual diagram
3. Add nodes and connect them yourself
4. Great for understanding how it works!

---

## Share Your Creations

Created a workflow? Share it on the [NodeTool repository](https://github.com/nodetool-ai/nodetool).
