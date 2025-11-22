---
layout: page
title: "Creative Story Ideas"
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

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
