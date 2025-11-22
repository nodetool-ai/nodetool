---
layout: page
title: "Flashcard Generator"
---

## Overview

Generate study flashcards using AI and store them persistently in a database. Enter any topic and get instant flashcards that are saved for future review.



## Tags

education, database, ai, flashcards, learning

## Workflow Diagram

{% mermaid %}
graph TD
  topic_topic_["topic"]
  createtable_create["CreateTable"]
  formattext_format["FormatText"]
  datagenerator_genera["DataGenerator"]
  insert_insert["Insert"]
  query_query_["Query"]
  topic_topic_ --> formattext_format
  formattext_format --> datagenerator_genera
  datagenerator_genera --> insert_insert
  createtable_create --> query_query_
  createtable_create --> query_query_
  createtable_create --> insert_insert
  createtable_create --> insert_insert
  createtable_create --> query_query_
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
