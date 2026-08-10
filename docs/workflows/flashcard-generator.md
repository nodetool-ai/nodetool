---
layout: page
title: "Flashcard Generator"
---

## Overview

Generate study flashcards using AI, then compute a study plan from them: no repeated questions, categories interleaved, and a review schedule per card.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/flashcards-sqlite.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/flashcards-sqlite.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

education, structured-data, ai, flashcards, learning

## Workflow Diagram

{% mermaid %}
graph TD
  topic_topic_["topic"]
  num_cards_input["num_cards"]
  formattext_format["Prompt"]
  datagenerator_genera["DataGenerator"]
  plan_study["Code (dedupe & order)"]
  plan_output["study_plan"]
  topic_topic_ --> formattext_format
  num_cards_input --> formattext_format
  formattext_format --> datagenerator_genera
  datagenerator_genera --> plan_study
  plan_study --> plan_output
{% endmermaid %}
