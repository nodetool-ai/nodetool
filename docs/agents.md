---
layout: page
title: "NodeTool Agent System"
---

## Key Features

- **Smart Task Planning**: Automatically breaks down complex goals into clear, executable subtasks.
- **LLM-Driven Execution**: Leverages LLMs to reason through subtasks, deciding when and how to use available tools.
- **Step-by-Step Reasoning**: Uses a structured approach to solve problems, ensuring clarity and accuracy.
- **Rich Tool Integration**: Comes equipped with tools for web browsing, file handling, code execution, data searching,
  PDF processing, and more.
- **Clear Data Management**: Ensures subtasks communicate clearly through structured inputs and outputs.
- **Independent Task Contexts**: Each subtask runs in isolation, preventing interference and ensuring reliability.
- **Parallel Processing**: Executes independent subtasks simultaneously, speeding up workflows.
- **Real-Time Progress Updates**: Provides live feedback during task execution.
- **Easy to Extend**: Allows developers to add custom tools and agents.
- **Robust Validation**: Checks task plans thoroughly to avoid errors and ensure smooth execution.

## How It Works

Here's a simple overview of how NodeTool operates:

1. **Define Your Objective**: You start by giving NodeTool a clear goal.
1. **Planning Phase**: NodeTool analyzes your goal and creates a detailed plan, breaking it down into smaller subtasks.
1. **Execution Phase**: Each subtask is executed independently within its own context (`SubTaskContext`). The LLM drives
   the execution, deciding whether to use tools or generate content based on the subtask's objective.
1. **Completion**: Results from subtasks are combined to achieve your original objective.

## Architecture Overview

NodeTool consists of several key components working together:

- **Agent**: Coordinates the entire process, from planning to execution.
- **Task Planner**: Breaks down your objective into a structured plan of subtasks.
- **Task Executor**: Manages the execution of subtasks, handling dependencies and parallel execution.
- **SubTask Context**: Provides an isolated environment for each subtask, managing interactions with tools and the LLM.
- **Tools**: A collection of specialized utilities that subtasks can use to perform actions like web browsing, file
  handling, and more.
- **Workspace**: A dedicated space where subtasks store and retrieve files.

## Execution Flow

```ascii
+-----------------------+
| Agent Initialization  |
| (Objective, Tools...) |
+-----------+-----------+
            |
            V
+-----------+-----------+
|    Task Planner       |
| (LLM Interaction)     |
|  - Analysis           |
|  - Data Flow          |
|  - Plan Creation      |
|  (Generates Task DAG) |
+-----------+-----------+
            | Task (DAG)
            V
+-----------+-----------+
|    Task Executor      |
| (Manages Subtasks)    |
+-----------+-----------+
      | Loop Until Done
      V
+-------------------------+   Yes   +-----------------------+
| Get Executable Subtasks |-------->| Any Executable Tasks? |
| (Check Dependencies)    |         +-----------+-----------+
+-------------------------+                    | No
            | Yes                              V
            V                              +-----------+-----------+
+-------------------------+                | All Tasks Complete?   |
| Create SubTaskContext   |                +-----------+-----------+
| For Each Executable Task|                            | No (Error?) / Yes
+-----------+-------------+                            V
            | Spawn Execution (Parallel/Sequential)    |
            V                                          V
+-----------+-------------+                 +-----------------------+
| SubTaskContext.execute()|                 | Agent.get_results()   |
+-----------+-------------+                 +-----------------------+
            | (Enters LLM Interaction Loop)
            V
+-------------------------+        +-----------+-------------+
|   LLM Interaction Loop  |<-------| Tool Execution/Response |
|   - Call LLM            |        +-----------+-------------+
|   - Handle Tool Calls   |                    ^
|   - Check Limits        |                    | Tool Call?
|   - Completion JSON?    |--------------------/ Yes
+-----------+-----------+
            | Yes (completion JSON emitted or forced)
            V
+-------------------------+
| Save Result (Content or |
| File Pointer)           |
+-------------------------+
            | Task Complete
            V Update Executor State
+-------------------------+
| Executor Monitors State |
| (Updates DAG, finds next)|
+-----------+-----------+
            | Back to Loop
            -------------------
```

1. **Initialization**: You provide an objective and select available tools.
1. **Planning**: NodeTool creates a detailed plan, identifying subtasks and their dependencies.
1. **Execution**: Subtasks are executed in order, respecting dependencies. Independent subtasks run in parallel. Each
   subtask runs within a `SubTaskContext`, where an LLM interaction loop determines the necessary steps, potentially
   involving tool calls.
1. **Completion**: Each subtask explicitly finishes by emitting a JSON block with `{"status":"completed","result":{...}}`.
   NodeTool stores these results and combines them to fulfill your original objective.

## Tools Available

NodeTool includes a variety of built-in tools:

- **Web Browsing**: Navigate and extract information from websites.
- **File Management**: Read, write, and manage files within the workspace.
- **Code Execution**: Run Python scripts or shell commands.
- **Data Search**: Perform searches using Google or semantic databases.
- **PDF Processing**: Extract text and tables from PDFs or convert PDFs to markdown.
- **API Integration**: Interact with external APIs seamlessly.

## Advanced Capabilities

- **Multi-Phase Planning**: NodeTool uses a structured approach (Analysis, Data Flow, Plan Creation) to ensure robust
  task plans.
- **Structured Output**: Leverages structured outputs from LLMs to reliably generate task plans.
- **Parallel Execution**: Runs independent subtasks simultaneously, significantly speeding up workflows.
- **Formal Task Completion**: Ensures each subtask explicitly finishes, clearly defining outputs and metadata.
- **Live Progress Visualization**: Provides real-time updates and visual feedback during execution.
- **Token Management**: Monitors and manages token usage to prevent exceeding LLM limits.

## Example Usage

Here's a quick example of how you might use NodeTool:

```python
from nodetool.agents.agent import Agent
from nodetool.providers import get_provider, Provider
from nodetool.agents.tools import (
    GoogleSearchTool,
    BrowserTool,
)
from nodetool.workflows.processing_context import ProcessingContext
import os
import asyncio

# Set up your provider and model
provider = get_provider(Provider.GEMINI)
model = "gemini-2.0-flash"

# Define available tools
tools = [
    GoogleSearchTool(),
    BrowserTool(),
]

# Create your agent
agent = Agent(
    name="Researcher",
    objective="Compare llamas and alpacas using Google Search and write the comparison to 'comparison.md'",
    provider=provider,
    model=model,
    tools=tools,
    output_type="markdown",
)

# Set up workspace
processing_context = ProcessingContext()

# Run the agent asynchronously
async def run_agent():
    async for update in agent.execute(processing_context):
        print(update)

asyncio.run(run_agent())
```

### Running in Docker

Set the `docker_image` parameter when creating an `Agent` to execute the entire plan inside a Docker container. The
workspace will be mounted at `/workspace` inside the container and input files are copied there automatically. Results
are written back to the same workspace on the host.

Environment variables required by the selected provider and tools will be passed through to the container automatically.

## Limitations and Considerations

- **Token Limits**: Complex tasks may hit token limits, requiring careful management within each `SubTaskContext`.
- **Planning Complexity**: Extremely complex objectives might require refining or simplifying.
- **Tool Reliability**: External tools can fail due to network issues or API limitations.
- **Security**: Running code or interacting with external systems carries inherent risks. Always use sandboxed
  environments.
- **Cost**: Extensive LLM interactions within subtasks can incur significant costs.

## Next Steps

- Explore built-in tools and their capabilities.
- Create custom agents tailored to your specific needs.
- Develop new tools to integrate with your own APIs or workflows.
- Experiment with different LLM providers and models to find the best fit for your tasks.

______________________________________________________________________

Happy building with NodeTool Agents! 🚀
