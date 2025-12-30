---
layout: page
title: "Python DSL Guide"
---

## Creating NodeTool Workflows

The Python DSL for building NodeTool workflows programmatically. Define AI workflows in Python while maintaining visual editor compatibility.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Basic Workflow Structure](#basic-workflow-structure)
4. [Input and Output Nodes](#input-and-output-nodes)
5. [Connecting Nodes](#connecting-nodes)
6. [Execution Methods](#execution-methods)
7. [Streaming Workflows](#streaming-workflows)
8. [Best Practices](#best-practices)

---

## Introduction

The NodeTool DSL:

- **Defines workflows in Python** without the visual editor
- **Version controls** workflows as code
- **Generates workflows** programmatically from data or templates
- **Integrates with Python scripts** and testing frameworks

Instantiate Python classes and connect them by passing outputs to inputs.

---

## Core Concepts

### 1. GraphNode

Every node in a workflow is a `GraphNode` - a Python object representing a computation step. When you instantiate a node class (like `StringInput` or `Agent`), you are creating a node in the graph.

### 2. OutputHandle

An `OutputHandle` represents a node's output. You don't access the *value* of the output directly when building the graph; instead, you pass this *handle* to other nodes to establish a connection.

- **`.output`**: The default output handle for single-output nodes.
- **`.out.<name>`**: Accessor for specific named outputs (e.g., `.out.text`, `.out.image`).

### 3. Connection Pattern

Connections are implicit. You connect Node A to Node B by passing Node A's output handle as an argument to Node B's constructor.

```python
# Connect input_node to processor_node
processor_node = Processor(text=input_node.output)
```

### 4. Graph Structure

A `Graph` is a Directed Acyclic Graph (DAG) of nodes and edges. The DSL automatically builds this structure for you as you define your nodes and their relationships.

---

## Basic Workflow Structure

All DSL workflows follow a standard 4-step pattern:

1. **Create Input Nodes**: Define the entry points for data.
2. **Create Processing Nodes**: Define the logic (AI models, transformations).
3. **Create Output Nodes**: Define what data should be returned.
4. **Execute**: Run the graph and await the results.

### Example

```python
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.nodetool.agents import Agent

async def simple_workflow():
    # 1. Input
    question = StringInput(value="What is AI?")

    # 2. Process
    agent = Agent(prompt=question.output, model=...)

    # 3. Output
    output = Output(value=agent.out.text)

    # 4. Execute
    return await graph_result(output)
```

---

## Input and Output Nodes

### Input Nodes

Input nodes are the starting points of your graph. They provide data to the workflow.

- **`StringInput`**: For text.
- **`ImageInput`**: For images (URLs or file paths).
- **`AudioInput`**: For audio files.
- **`DataframeInput`**: For tabular data (Pandas DataFrames).

### Output Nodes

Output nodes capture the final results. You must connect the end of your processing chain to an output node to receive data back.

- **`Output`**: Generic output node that handles all data types (text, images, audio, etc.)

---

## Connecting Nodes

### Single Output

Most nodes have a primary output accessible via `.output`.

```python
node_b = NodeB(input_param=node_a.output)
```

### Multiple Outputs

Some nodes (like `AutomaticSpeechRecognition`) produce multiple results. Access them via `.out`:

```python
asr = AutomaticSpeechRecognition(audio=...)
text_node = TextProcessor(text=asr.out.text)
lang_node = LanguageProcessor(lang=asr.out.language)
```

### Branching

You can connect one output to multiple inputs to create parallel branches.

```python
source = StringInput(...)
branch1 = ProcessorA(input=source.output)
branch2 = ProcessorB(input=source.output)
```

---

## Execution Methods

### 1. `graph_result()`

Use this for simple workflows where you just want the result of one or more output nodes. It handles graph construction and execution in one step.

```python
result = await graph_result(output_node)
# Returns: {"output_node_name": "value"}
```

### 2. `run_graph()`

Use this when you need fine-grained control, such as:

- Streaming execution
- Custom user IDs
- Specific asset output modes (e.g., saving files to workspace vs. returning URLs)

```python
g = graph(output_node)
result = await run_graph(g, asset_output_mode=AssetOutputMode.WORKSPACE)
```

---

## Streaming Workflows

Streaming allows you to receive intermediate results, logs, and progress updates in real-time. This is essential for long-running AI tasks or interactive applications.

### How it Works

Instead of awaiting a final result, you iterate over an async generator returned by `run_workflow`.

```python
async for message in run_workflow(g):
    # Handle updates
```

### Message Types

You will receive various message objects during execution:

- **`NodeUpdate`**: Status changes (running, completed, failed).
- **`NodeProgress`**: Percentage progress for long tasks.
- **`LogUpdate`**: Text logs from nodes.
- **`OutputUpdate`**: Final results from Output nodes.
- **`PreviewUpdate`**: Intermediate previews (e.g., partially generated images).
- **`Error`**: Error details if something goes wrong.

### When to Use Streaming

- **Long-running workflows**: Give users feedback during minutes-long processes.
- **Chat interfaces**: Stream tokens as they are generated.
- **Complex debugging**: See exactly which node is running or failing.

---

## Best Practices

1. **Use Async/Await**: All DSL execution is asynchronous. Always run workflows within an `async` function.
2. **Name Your Nodes**: Give meaningful `name` parameters to Input and Output nodes. These names become the keys in the result dictionary.
3. **Validate Inputs**: Check input data before creating the graph to fail fast.
4. **Centralize Config**: Store model IDs and API keys in a central configuration dictionary rather than hardcoding them in every node.
5. **Type Hints**: Use Python type hints for your workflow functions to make them self-documenting.

```python
# Good naming example
input_node = StringInput(name="user_query", value="...")
output_node = Output(name="search_results", value=...)
result = await graph_result(output_node)
# result["search_results"] will contain the data
```
