---
layout: page
title: "Data Generator"
---

## Overview

Generates a structured dataset from a one-line topic. You define the columns once on the `DataGenerator` node and get validated rows back instead of prose.

1. **Inputs** - `topic` (`nodetool.input.StringInput`) and `row_count` (`nodetool.input.IntegerInput`, 3 to 30, default 8).
2. **Prompt** (`nodetool.text.Prompt`) - Fills {% raw %}`{{TOPIC}}`{% endraw %} and {% raw %}`{{ROW_COUNT}}`{% endraw %} into the generation instructions.
3. **DataGenerator** (`nodetool.generators.DataGenerator`) - Asks the selected language model for rows that match the columns. The template defines two string columns, `name` and `color`, and selects `gpt-5-mini`. Edit the columns to change the shape.
4. **Output** - The `dataframe` output goes to `generated_data`. The node also streams each row as a `record` output.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/data-generator.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/data-generator.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

agents

## Workflow Diagram

{% mermaid %}
graph TD
  topic["StringInput (topic)"]
  count["IntegerInput (row_count)"]
  prompt["Prompt"]
  generator["DataGenerator"]
  out["Output (generated_data)"]
  topic -->|TOPIC| prompt
  count -->|ROW_COUNT| prompt
  prompt --> generator
  generator -->|dataframe| out
{% endmermaid %}
