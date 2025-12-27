---
layout: page
title: "Creative Story Ideas"
---

## What You'll Achieve

**Generate dozens of story ideas in seconds**—perfect for writers, game designers, and content creators who need creative inspiration fast. This beginner-friendly workflow demonstrates NodeTool's core concepts while producing real, usable story prompts.

**Learning outcomes:**
- ✅ Understand how data flows through visual workflows
- ✅ See AI streaming results in real-time
- ✅ Learn to customize prompts with input nodes
- ✅ Master the template pattern for reusable workflows

**Time to complete:** 5 minutes  
**Difficulty:** Beginner (perfect first workflow)

---

## Why This Workflow Matters

**For writers:** Never stare at a blank page again. Generate story hooks instantly.  
**For game designers:** Create NPC backstories and quest ideas at scale.  
**For students:** Learn AI workflow design with immediate visual feedback.  
**For teams:** Share this workflow as a Mini-App—teammates can generate ideas without seeing the technical details.

---

## Overview

A beginner-friendly template demonstrating core NodeTool concepts: inputs, templates, LLM agents, streaming, and outputs. Generate creative story ideas based on your preferences.

This workflow demonstrates the core concepts of NodeTool:

## 📥 INPUTS (Green nodes on left)

• Three StringInput nodes let you customize the story

• Try changing Genre, Character, or Setting values

## 📝 TEMPLATE FORMATTING

• The constant template defines the prompt structure

• FormatText node combines inputs with {{PLACEHOLDERS}}

• Dynamic properties map inputs to template variables

## 🤖 AI GENERATION

• ListGenerator streams multiple story ideas

• Each idea appears one at a time (iteration/streaming)

• Downstream nodes process each item automatically

## 👁️ OUTPUT & PREVIEW

• Preview nodes display intermediate and final results

• Top preview shows the formatted prompt

• Bottom preview shows all generated story ideas

## 🎯 KEY LEARNING POINTS:

Data flows left-to-right through connected nodesEdges connect outputs (right) to inputs (left)Templates use {{VARIABLES}} for dynamic contentStreaming nodes emit multiple values over timePreview nodes help debug and visualize data

## 💡 TRY THIS:

• Click the input nodes and change their values

• Run the workflow and watch results appear

• Modify the template to add more instructions

• Try connecting nodes in different ways

## Tags

start, beginner, tutorial, template

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

1. Open NodeTool and find "Creative Story Ideas" in the Templates panel
2. Click to open in the editor (or build manually following the diagram above)
3. **Customize inputs** – Click the Genre, Character Type, and Setting nodes to enter your preferences
4. **Run workflow** – Press <kbd>Ctrl/⌘ + Enter</kbd> or click the Run button
5. **Watch streaming** – Ideas appear one at a time in the Preview node (not all at once!)
6. **Export results** – Right-click Preview node → Copy to use ideas in your writing

**Pro tip:** Save as a Mini-App (top-right button) to share with teammates. They'll see a simple form interface without the workflow complexity.

---

## Real-World Applications

**Content creators:** Generate video ideas, blog post hooks, and social media content  
**Novelists:** Overcome writer's block with fresh plot concepts  
**Game developers:** Create quest descriptions, character backstories, and world-building elements  
**Educators:** Teach creative writing with AI-assisted brainstorming  
**Marketing teams:** Brainstorm campaign concepts and ad copy angles

---

## Next Steps After This Workflow

Now that you understand the basics, try these progressively advanced workflows:

1. **[Transcribe Audio](transcribe-audio.md)** – Work with media files (audio → text)
2. **[Image Enhance](image-enhance.md)** – Chain multiple transformations
3. **[Chat with Docs](chat-with-docs.md)** – Build a RAG system with vector search
4. **[Movie Posters](movie-posters.md)** – Multi-stage agent planning workflow

Or explore all [workflow examples](/workflows/) to see what's possible.
