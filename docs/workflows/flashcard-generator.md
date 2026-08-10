---
layout: page
title: "Flashcard Generator"
---

## Overview

Generate study flashcards using AI and keep them in a workspace file that grows across runs. Enter any topic and get instant flashcards saved for future review.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/flashcards-sqlite.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/flashcards-sqlite.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

education, persistence, ai, flashcards, learning

## Workflow Diagram

{% mermaid %}
graph TD
  topic_topic_["topic"]
  num_cards_input["num_cards"]
  formattext_format["Prompt"]
  datagenerator_genera["DataGenerator"]
  store_cards["Code (save & read back)"]
  deck_output["saved_deck"]
  topic_topic_ --> formattext_format
  num_cards_input --> formattext_format
  formattext_format --> datagenerator_genera
  datagenerator_genera --> store_cards
  store_cards --> deck_output
{% endmermaid %}
