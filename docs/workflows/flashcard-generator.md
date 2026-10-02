---
layout: page
title: "Flashcard Generator"
---

## Overview

Generates study flashcards as structured rows, then computes a study plan from them: no repeated questions, categories interleaved, and a review schedule per card.

1. **Inputs** - `topic` (`nodetool.input.StringInput`) and `num_cards` (`nodetool.input.IntegerInput`, 3 to 15, default 5).
2. **Prompt** (`nodetool.text.Prompt`) - Fills {% raw %}`{{TOPIC}}`{% endraw %} and {% raw %}`{{NUM_CARDS}}`{% endraw %} into the card-writing instructions.
3. **DataGenerator** (`nodetool.generators.DataGenerator`) - Returns rows with `front`, `back`, and `category` columns. The `dataframe` output goes to the `Flashcards` output and to the next step.
4. **Code** (`nodetool.code.Code`) - Drops repeated questions, deals one card from each category in turn, and assigns each card `review_after_days` of `[0, 2, 5]`.
5. **Outputs** - `Flashcards` and `study_plan`.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/flashcards-sqlite.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/flashcards-sqlite.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

education, structured-data, ai, flashcards, learning

## Workflow Diagram

{% mermaid %}
graph TD
  topic["StringInput (topic)"]
  count["IntegerInput (num_cards)"]
  prompt["Prompt"]
  generator["DataGenerator"]
  plan["Code (study plan)"]
  cards["Output (Flashcards)"]
  planOut["Output (study_plan)"]
  topic -->|TOPIC| prompt
  count -->|NUM_CARDS| prompt
  prompt --> generator
  generator -->|dataframe| cards
  generator -->|dataframe| plan
  plan -->|study_plan| planOut
{% endmermaid %}
