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

1. **Data Flows Through Edges**: Nodes connect via typed edges (image → image, text → text, etc.)
1. **Asynchronous Execution**: Nodes execute when dependencies are satisfied
1. **Streaming by Default**: Many nodes support real-time streaming output
1. **Type Safety**: Connections enforce type compatibility

### Node Types

| Type                 | Purpose           | Examples                                  |
| -------------------- | ----------------- | ----------------------------------------- |
| **Input Nodes**      | Accept parameters | `StringInput`, `ImageInput`, `AudioInput` |
| **Processing Nodes** | Transform data    | `Resize`, `Filter`, `ExtractText`         |
| **Agent Nodes**      | LLM-powered logic | `Agent`, `Summarizer`, `ListGenerator`    |
| **Output Nodes**     | Return results    | `ImageOutput`, `StringOutput`, `Preview`  |
| **Control Nodes**    | Flow control      | `Collect`, `FormatText`                   |
| **Storage Nodes**    | Persistence       | `CreateTable`, `Insert`, `Query`          |

______________________________________________________________________

## Streaming Architecture

### Why Streaming?

NodeTool workflows support **streaming execution** for:

- **Real-time feedback**: See results as they're generated
- **Lower latency**: Start processing before all data arrives
- **Better UX**: Progress indicators and incremental results
- **Efficient memory**: Process large data in chunks

### Streaming Nodes

Nodes that support streaming output:

- **`Agent`**: Streams LLM responses token by token
- **`ListGenerator`**: Streams list items as they're generated
- **`RealtimeAgent`**: Streams audio + text responses
- **`RealtimeWhisper`**: Streams transcription as audio arrives
- **`RealtimeAudioInput`**: Streams audio from an input source

### Data Flow Patterns

#### Pattern 1: Sequential Pipeline

```
Input → Process → Transform → Output
```

Each node waits for previous node to complete.

#### Pattern 2: Parallel Branches

```
        → ProcessA → OutputA
Input →
        → ProcessB → OutputB
```

Multiple branches execute in parallel.

#### Pattern 3: Streaming Pipeline

```
Input → StreamingAgent → Collect → Output
         (yields chunks)
```

Data flows in chunks, enabling real-time updates.

#### Pattern 4: Fan-In Pattern

```
SourceA →
         → Combine → Process → Output
SourceB →
```

Multiple inputs combine before processing.
