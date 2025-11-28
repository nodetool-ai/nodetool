---
layout: page
title: "Key Concepts"
---



NodeTool workflows are represented as **Directed Acyclic Graphs (DAGs)**. Each node performs a unit of work and passes
data to the next node.

- **Nodes** – Encapsulate a specific operation. Nodes have inputs, outputs and configurable properties.
- **Graph** – A collection of nodes and their connections. Use `graph()` to build graphs and `run_graph()` to execute
  them.
- **DSL** – NodeTool provides a Python domain specific language with modules for different domains
  (`nodetool.dsl.chroma`, `nodetool.dsl.google`, ...).
- **WorkflowRunner** – The engine that executes graphs. It handles parallel execution, GPU management and progress
  updates.
- **ProcessingContext** – Holds runtime information like user data and authentication tokens.

Understanding these concepts will help you design efficient workflows and build your own nodes and agents.

## Node Type Resolution

When a workflow references a node by its type string (e.g., `package.Namespace.Class`), NodeTool resolves the class
using a robust strategy:

- In-memory registry lookup (with and without a trailing `Node` suffix)
- Dynamic import of modules based on the type path, then re-check the registry
- Lookup in the installed packages registry for external nodes
- Fallback match by class name only, ignoring an optional `Node` suffix

This enables loading graphs without pre-importing all node modules and supports short class-name references in some
cases.
