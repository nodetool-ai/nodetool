---
layout: page
title: "Chat with Docs"
---

## Overview

Retrieval-augmented question answering over your own documents. The template indexes three short documents into a vector collection, retrieves passages, and answers from those passages only, citing the source of each claim. It is the "Chat With Your Documents" template under **Examples**.

1. **Inputs** - `question`, `search` (the text used for retrieval), and three document texts (`doc_specs`, `doc_charging`, `doc_warranty`), all `nodetool.input.StringInput`.
2. **Collection** (`vector.Collection`) - A collection named `aurora_docs` that uses the Ollama `nomic-embed-text` embedding model. Run Ollama with that model available.
3. **Indexing** (`vector.IndexTextChunk`, three nodes) - Each document goes into the collection with a `document_id` and a `source` metadata entry.
4. **Retrieval** (`vector.QueryText`) - Queries the collection with the `search` text and returns the top 5 `documents`.
5. **Context** - A `Code` node joins the passages, and a `nodetool.text.Prompt` combines them with the question.
6. **Answer** (`nodetool.agents.Agent`) - Answers strictly from the passages, cites the passage heading after each claim, and replies "I couldn't find that in the provided documents." when the answer is absent. The template selects `gpt-5-mini`.
7. **Outputs** - `Answer` and `Retrieved Passages`.

The `search` input is separate from the `question`. The shipped value, `Aurora`, appears in every document, so retrieval returns the whole corpus. Narrow it, for example to `warranty`, to retrieve one topic. Replace the three document inputs to use your own corpus.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/chat-with-docs.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/chat-with-docs.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

rag, vectorstore, retrieval, llm, citations

## Workflow Diagram

{% mermaid %}
graph TD
  collection["Collection (aurora_docs)"]
  docs["StringInput x3 (documents)"]
  index["IndexTextChunk x3"]
  search["StringInput (search)"]
  query["QueryText"]
  join["Code (join passages)"]
  question["StringInput (question)"]
  prompt["Prompt"]
  agent["Agent"]
  answer["Output (Answer)"]
  passages["Output (Retrieved Passages)"]
  docs -->|text| index
  collection --> index
  collection --> query
  search -->|text| query
  query -->|documents| join
  join -->|CONTEXT| prompt
  question -->|QUESTION| prompt
  prompt --> agent --> answer
  join --> passages
{% endmermaid %}
