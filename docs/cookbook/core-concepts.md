---
layout: page
title: Core Concepts & Architecture
parent: NodeTool Workflow Cookbook
nav_order: 1
---

# Core Concepts & Architecture

## Core Concepts

### What is a NodeTool Workflow?

A NodeTool workflow is a **Directed Acyclic Graph (DAG)** where:

- **Nodes** represent operations (processing, generation, transformation)
- **Edges** represent data flow between nodes
- **Execution** follows dependency order automatically

```
Input → Process → Transform → Output
```

### Key Principles

1. **Data flows through typed edges** — connections enforce type compatibility (image → image, text → text). You cannot connect an image output to a text input.
2. **Dependency-driven execution** — nodes execute automatically when all their inputs are ready. You never need to specify execution order manually.
3. **Streaming by default** — many nodes produce output incrementally (token by token, frame by frame), enabling real-time feedback.
4. **Parallel when possible** — independent branches of a workflow execute concurrently. NodeTool analyzes the graph to maximize parallelism.

### Node Types

| Type                 | Purpose           | Examples                                  |
| -------------------- | ----------------- | ----------------------------------------- |
| **Input Nodes**      | Accept parameters | `StringInput`, `ImageInput`, `AudioInput` |
| **Processing Nodes** | Transform data    | `Resize`, `Filter`, `ExtractText`         |
| **Agent Nodes**      | LLM-powered logic | `Agent`, `Summarizer`, `ListGenerator`    |
| **Output Nodes**     | Return results    | `Output`, `Preview`                       |
| **Control Nodes**    | Flow control      | `Collect`, `FormatText`                   |
| **Storage Nodes**    | Persistence       | `CreateTable`, `Insert`, `Query`          |

---

## Data Types

NodeTool enforces type safety on all connections. Here are the common data types:

| Type | Description | Example Nodes |
|------|------------|---------------|
| **String** | Text data | `StringInput`, `FormatText`, `Agent` |
| **Image** | Image data (PNG, JPEG, etc.) | `TextToImage`, `Resize`, `ImageInput` |
| **Audio** | Audio data (WAV, MP3, etc.) | `TextToSpeech`, `AudioInput` |
| **Video** | Video data | `TextToVideo`, `ImageToVideo` |
| **List[T]** | A list of items of type T | `ListGenerator`, `Split`, `Collect` |
| **Dict** | Key-value pairs | `DictToJson`, `ExtractField` |
| **Number** | Integer or float | `NumberInput`, `Calculator` |
| **Boolean** | True/false | `BooleanInput`, `Compare` |

When connecting nodes, NodeTool validates types automatically. Some conversions happen implicitly (e.g., Image formats), while others require explicit conversion nodes.

---

## Streaming Architecture

### Why Streaming?

NodeTool workflows support **streaming execution** for:

- **Real-time feedback** — see results as they're generated
- **Lower latency** — start processing before all data arrives
- **Better UX** — progress indicators and incremental results
- **Efficient memory** — process large data in chunks

### Streaming Nodes

Nodes that support streaming output:

| Node | What It Streams |
|------|----------------|
| **`Agent`** | LLM responses token by token |
| **`ListGenerator`** | List items as they're generated |
| **`RealtimeAgent`** | Audio + text responses simultaneously |
| **`RealtimeWhisper`** | Transcription as audio arrives |
| **`RealtimeAudioInput`** | Audio from an input source |

### Data Flow Patterns

#### Pattern 1: Sequential Pipeline

{% mermaid %}
graph LR
    A[Input] --> B[Process] --> C[Transform] --> D[Output]
{% endmermaid %}

Each node waits for the previous node to complete before starting.

#### Pattern 2: Parallel Branches

{% mermaid %}
graph LR
    A[Input] --> B[Process A]
    A --> C[Process B]
    B --> D[Output A]
    C --> E[Output B]
{% endmermaid %}

Independent branches execute in parallel, improving throughput.

#### Pattern 3: Streaming Pipeline

{% mermaid %}
graph LR
    A[Input] --> B[Streaming Agent]
    B -->|yields chunks| C[Collect]
    C --> D[Output]
{% endmermaid %}

Data flows in chunks, enabling real-time updates. The `Collect` node gathers all chunks into a single output.

#### Pattern 4: Fan-In Pattern

{% mermaid %}
graph LR
    A[Source A] --> C[Combine]
    B[Source B] --> C
    C --> D[Process] --> E[Output]
{% endmermaid %}

Multiple inputs combine before processing. The Combine node waits for all sources.

---

## Error Handling

When a node fails during execution:

1. **The node turns red** — indicating an error occurred
2. **Downstream nodes are skipped** — they won't receive data from the failed node
3. **Other branches continue** — independent parts of the workflow still execute
4. **Error details are available** — click the failed node to see the full error message

**Common strategies for handling errors in workflows:**

- **Add Preview nodes** before and after suspect nodes to inspect data
- **Use default values** on inputs to handle missing data gracefully
- **Check model availability** before running — ensure required models are installed
- **Test incrementally** — build and test workflows one node at a time
