# Agent System Documentation

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Docs**

This guide documents the NodeTool agent system architecture, including task planning, step execution, and the create_task tool.

## Overview

NodeTool's agent system provides autonomous task execution through a hierarchical planning and execution model. The system breaks down complex objectives into executable steps, manages dependencies, and orchestrates execution across multiple LLM providers.

### Key Components

- **TaskPlanner**: Breaks down objectives into structured Task plans
- **StepExecutor**: Executes individual steps with tool access
- **Task**: Container with title and list of Steps
- **Step**: Individual unit of work with dependencies and instructions
- **create_task Tool**: LLM tool for generating task plans

## Architecture

### Task Planning

The **TaskPlanner** (`/src/nodetool/agents/task_planner.py`) transforms user objectives into structured task plans:

1. **Planning Phase**: Uses the `create_task` tool to generate a structured Task
2. **Validation**: Ensures dependencies form a valid DAG (Directed Acyclic Graph)
3. **Schema Enforcement**: Validates that output schemas are valid JSON
4. **Retry Logic**: Automatically retries on validation failures with feedback

### Step Execution

The **StepExecutor** (`/src/nodetool/agents/step_executor.py`) executes individual steps:

1. **Context Building**: Gathers outputs from dependency steps
2. **Tool Provisioning**: Provides step with access to specified tools
3. **LLM Interaction**: Uses provider to execute step instructions
4. **Output Validation**: Validates output against step's output_schema
5. **Result Storage**: Stores validated output for dependent steps

## Data Models

### Task

A Task is a container representing the overall objective:

```python
class Task:
    title: str              # Descriptive title
    steps: List[Step]       # List of execution steps
```

### Step

A Step is an individual unit of work:

```python
class Step:
    id: str                          # Unique snake_case identifier
    instructions: str                # Clear, actionable instructions
    depends_on: List[str]            # Step IDs this depends on
    
    # Optional fields
    mode: str | None                 # "discover" | "process" | "aggregate"
    output_schema: str | None        # JSON schema string for output
    per_item_instructions: str | None  # Template for process mode
    per_item_schema: str | None      # JSON schema for each item
    tools: List[str] | None          # Specific tools to use
```

## The create_task Tool

The `create_task` tool is how LLMs generate task plans. It's defined in `task_planner.py`:

```python
class CreateTaskTool(Tool):
    name = "create_task"
    description = """Create an executable task with a list of steps..."""
    input_schema = Task.model_json_schema()
```

### Tool Description

The tool description guides the LLM to:

- Create tasks with clear titles
- Define steps with unique IDs
- Specify dependencies forming a valid DAG
- Use appropriate modes for different patterns
- Provide valid JSON schemas when needed

### Validation

When the LLM calls `create_task`, the planner validates:

1. **Unique IDs**: All step IDs must be unique
2. **DAG Structure**: No circular dependencies
3. **Valid Dependencies**: All `depends_on` IDs exist (as steps or inputs)
4. **Schema Validity**: All `output_schema` and `per_item_schema` are valid JSON

## Execution Patterns

### Sequential Pattern

Steps execute one after another:

```python
steps = [
    Step(id="download_file", instructions="Download data.csv", depends_on=[]),
    Step(id="parse_data", instructions="Parse CSV", depends_on=["download_file"]),
    Step(id="generate_summary", instructions="Summarize", depends_on=["parse_data"])
]
```

### Fan-Out Pattern (Discover → Process → Aggregate)

Discovery happens during planning, then process each item, then aggregate:

```python
steps = [
    # Process each item (fan-out happens during planning)
    Step(
        id="process_item_1",
        instructions="Analyze article 1",
        depends_on=[]
    ),
    Step(
        id="process_item_2", 
        instructions="Analyze article 2",
        depends_on=[]
    ),
    # Aggregate results (fan-in)
    Step(
        id="aggregate",
        instructions="Combine all analyses",
        depends_on=["process_item_1", "process_item_2"],
        mode="aggregate"
    )
]
```

### Parallel Pattern

Independent steps run concurrently, then merge:

```python
steps = [
    Step(id="research_topic_a", instructions="Research A", depends_on=[]),
    Step(id="research_topic_b", instructions="Research B", depends_on=[]),
    Step(
        id="combine_findings",
        instructions="Merge research",
        depends_on=["research_topic_a", "research_topic_b"]
    )
]
```

### Single Step Pattern

One atomic operation for simple objectives:

```python
steps = [
    Step(id="simple_task", instructions="Complete the objective", depends_on=[])
]
```

## Using Modes

### Discover Mode

Used during planning to find items to process. The planner uses discovery during plan creation, not execution.

### Process Mode

Processes multiple items using a template:

```python
Step(
    id="process_repos",
    mode="process",
    instructions="Analyze each repository",
    per_item_instructions="Analyze repository {name} at {url}",
    per_item_schema='{"type": "object", "properties": {"analysis": {"type": "string"}}}'
)
```

### Aggregate Mode

Combines outputs from multiple steps:

```python
Step(
    id="create_report",
    mode="aggregate",
    instructions="Create final report from all analyses",
    depends_on=["analysis_1", "analysis_2", "analysis_3"],
    output_schema='{"type": "object", "properties": {"summary": {"type": "string"}}}'
)
```

## System Prompts

### Planning System Prompt

The `DEFAULT_PLANNING_SYSTEM_PROMPT` defines the LLM's role:

```markdown
<role>
You are a TaskArchitect that transforms user objectives into executable Task plans.
</role>

<terminology>
- **Task**: A container with a title and a list of Steps.
- **Step**: An individual unit of work with dependencies, instructions, and output schema.
</terminology>
```

### Execution Patterns in Prompt

The prompt guides the LLM on choosing patterns:

```markdown
**Sequential** - Steps execute one after another
  Example: "Download file → Parse content → Generate summary"

**Fan-out (Discover → Process → Aggregate)** - Find items, process each, combine
  Example: "Find repos → Analyze each → Create comparison"
   
**Parallel** - Independent Steps run concurrently, then merge
  Example: "Research A | Research B → Combine findings"

**Single Step** - One atomic operation for simple objectives
```

## Validation Rules

The planner enforces these rules:

1. **Unique Step IDs**: All step IDs must be unique and descriptive
2. **Valid DAG**: Dependencies must form a Directed Acyclic Graph (no cycles)
3. **Existing Dependencies**: All referenced step IDs must exist or be input keys
4. **Atomic Steps**: Steps should be smallest executable units
5. **Valid Schemas**: All `output_schema` fields must be valid JSON strings

## Tool Access

Steps can restrict which tools they use:

```python
Step(
    id="web_research",
    instructions="Research topic online",
    tools=["google_search", "browser"]  # Only these tools available
)
```

If `tools` is not specified, all execution tools are available to the step.

## Input Handling

Tasks can reference inputs from the planner's context:

```python
planner = TaskPlanner(
    inputs={"topic": "AI workflows", "max_results": 5}
)

# Steps can depend on inputs
Step(
    id="analyze_topic",
    instructions="Analyze the topic",
    depends_on=["topic"]  # References input key
)
```

## Output Schemas

Steps can define expected output formats using JSON Schema:

```python
Step(
    id="fetch_data",
    instructions="Fetch user data",
    output_schema=json.dumps({
        "type": "object",
        "properties": {
            "users": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"}
                    }
                }
            }
        },
        "required": ["users"]
    })
)
```

The StepExecutor validates output against this schema before storing.

## Example Usage

### Basic Agent Execution

```python
from nodetool.agents.task_planner import TaskPlanner
from nodetool.agents.step_executor import StepExecutor
from nodetool.providers.openai_provider import OpenAIProvider

# Initialize provider and planner
provider = OpenAIProvider()
planner = TaskPlanner(
    provider=provider,
    model="gpt-4o",
    objective="Research top 3 AI frameworks and compare them",
    workspace_dir="/workspace",
    execution_tools=[google_search_tool, browser_tool]
)

# Create task plan
async for update in planner.create_task(context):
    print(f"{update.phase}: {update.status}")

# Execute the task
executor = StepExecutor(
    task_plan=planner.task_plan,
    provider=provider,
    model="gpt-4o",
    workspace_dir="/workspace",
    tools=[google_search_tool, browser_tool]
)

async for result in executor.execute(context):
    print(f"Step {result.step_id}: {result.status}")
```

### With Custom Output Schema

```python
output_schema = {
    "type": "object",
    "properties": {
        "frameworks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "pros": {"type": "array", "items": {"type": "string"}},
                    "cons": {"type": "array", "items": {"type": "string"}}
                }
            }
        },
        "recommendation": {"type": "string"}
    }
}

planner = TaskPlanner(
    provider=provider,
    model="gpt-4o",
    objective="Research and compare AI frameworks",
    workspace_dir="/workspace",
    execution_tools=tools,
    output_schema=output_schema
)
```

## Planning Updates

The planner yields `PlanningUpdate` events during planning:

```python
class PlanningUpdate:
    phase: str      # Current phase: "Planning", "Plan Creation"
    status: str     # "Starting", "Running", "Completed", "Failed"
    content: str    # Status message or error
```

Listen to these updates to track planning progress:

```python
async for update in planner.create_task(context):
    if isinstance(update, PlanningUpdate):
        print(f"[{update.phase}] {update.status}: {update.content}")
```

## Error Handling

### Planning Errors

Common planning errors:

- **Circular Dependencies**: Steps form a cycle
- **Missing Dependencies**: Step depends on non-existent step/input
- **Invalid Schema**: `output_schema` is not valid JSON
- **LLM Refusal**: LLM doesn't call `create_task` tool

The planner retries with feedback on validation failures:

```python
planner = TaskPlanner(..., max_retries=3)
```

### Execution Errors

Common execution errors:

- **Tool Failure**: Tool execution raises exception
- **Schema Validation**: Output doesn't match `output_schema`
- **Missing Context**: Dependency outputs not available

The executor handles errors gracefully and reports them in results.

## File Locations

### Core Files

- `/src/nodetool/agents/task_planner.py` - Task planning logic
- `/src/nodetool/agents/step_executor.py` - Step execution logic
- `/src/nodetool/metadata/types.py` - Task/Step data models

### Tool Definitions

- `/src/nodetool/agents/tools/` - Available execution tools
- `/src/nodetool/agents/task_planner.py` - CreateTaskTool definition

### Example Workflows

- `/examples/` - Example agent workflows

## Configuration

### Provider Configuration

```python
from nodetool.providers.anthropic_provider import AnthropicProvider

provider = AnthropicProvider(
    api_key=os.getenv("ANTHROPIC_API_KEY")
)

planner = TaskPlanner(
    provider=provider,
    model="claude-3-5-sonnet-20241022",
    reasoning_model="claude-3-7-sonnet-20250219",  # For complex reasoning
    ...
)
```

### Display Manager

Control output verbosity:

```python
from nodetool.ui.console import AgentConsole

console = AgentConsole()
planner = TaskPlanner(
    display_manager=console,
    verbose=True,
    ...
)
```

## Testing

### Unit Tests

Test task planning:

```python
async def test_simple_plan():
    planner = TaskPlanner(
        provider=MockProvider(),
        model="test",
        objective="Simple task",
        workspace_dir="/tmp",
        execution_tools=[]
    )
    
    async for update in planner.create_task(context):
        pass
    
    assert len(planner.task_plan.tasks) > 0
    assert len(planner.task_plan.tasks[0].steps) > 0
```

### Integration Tests

Test end-to-end execution:

```python
async def test_full_execution():
    # Create plan
    planner = TaskPlanner(...)
    async for _ in planner.create_task(context):
        pass
    
    # Execute plan
    executor = StepExecutor(
        task_plan=planner.task_plan,
        ...
    )
    
    results = []
    async for result in executor.execute(context):
        results.append(result)
    
    assert all(r.status == "success" for r in results)
```

## Best Practices

### 1. Clear Objectives

Write specific, actionable objectives:

```python
# Good
objective = "Find the top 3 Python ML libraries on GitHub by stars, analyze their README files, and create a comparison table"

# Too vague
objective = "Research ML libraries"
```

### 2. Atomic Steps

Keep steps focused on single responsibilities:

```python
# Good
Step(id="fetch_readme", instructions="Download the README.md file")
Step(id="parse_readme", instructions="Parse markdown to extract sections")

# Too broad
Step(id="analyze_repo", instructions="Fetch and analyze the entire repository")
```

### 3. Appropriate Schemas

Define schemas that match expected output:

```python
# Detailed schema for structured data
output_schema = {
    "type": "object",
    "properties": {
        "results": {"type": "array", "items": {...}}
    },
    "required": ["results"]
}

# Simple schema for text
output_schema = {"type": "string"}
```

### 4 Tool Selection

Provide only necessary tools to avoid confusion:

```python
# For web research
execution_tools = [google_search_tool, browser_tool]

# For file processing
execution_tools = [file_reader_tool, text_parser_tool]
```

### 5. Dependency Management

Ensure proper dependency ordering:

```python
# Good - clear linear dependency
Step(id="download", depends_on=[])
Step(id="parse", depends_on=["download"])
Step(id="analyze", depends_on=["parse"])

# Avoid - unnecessary dependencies
Step(id="download", depends_on=[])
Step(id="parse", depends_on=["download"])
Step(id="analyze", depends_on=["download", "parse"])  # Only needs "parse"
```

## Troubleshooting

### Planning Fails with Circular Dependency

**Problem**: LLM creates steps with circular dependencies

**Solution**: The planner will retry with feedback. If persistent, simplify the objective or reduce complexity.

### LLM Doesn't Call create_task

**Problem**: LLM responds with text instead of calling the tool

**Solution**: Check provider supports tool calling. Ensure prompts are clear. Try different model.

### Schema Validation Fails

**Problem**: Step output doesn't match `output_schema`

**Solution**:

- Ensure schema is valid JSON Schema format
- Make schema flexible (don't require all fields)
- Check LLM model supports structured output

### Steps Execute Out of Order

**Problem**: Steps run before dependencies complete

**Solution**: Ensure dependencies are specified in `depends_on`. The executor respects the DAG.

## Related Files

- [Task Types](/src/nodetool/metadata/types.py) - Core data models
- [Provider Base](/src/nodetool/providers/base_provider.py) - Provider interface
- [Tools](/src/nodetool/agents/tools/) - Available execution tools
- [Examples](/examples/) - Example workflows

---

**Note**: This documentation covers the agent system architecture. For API-level details, see the source code documentation in the respective modules.

## Key Documentation Files

### Getting Started

- `index.md` - Homepage
- `getting-started.md` - Quick start guide
- `installation.md` - Installation instructions
- `key-concepts.md` - Core concepts

### User Guides

- `workflow-editor.md` - Workflow editor usage
- `user-interface.md` - UI overview
- `asset-management.md` - Managing assets
- `models-manager.md` - Model management

### Node Documentation

- `/nodes/comfy/` - ComfyUI nodes
- `/nodes/huggingface/` - HuggingFace nodes
- `/nodes/openai/` - OpenAI nodes
- `/nodes/nodetool/` - NodeTool core nodes

### Developer Documentation

- `/developer/` - Developer-focused guides
- `api-reference.md` - API documentation
- `deployment.md` - Deployment guides

### Cookbooks & Examples

- `/cookbook/` - Step-by-step tutorials
- `/workflows/` - Example workflows

## Writing Documentation

### Markdown Format

Use GitHub Flavored Markdown:

```markdown
# Page Title

Brief introduction paragraph.

## Section Heading

Content goes here.

### Subsection

More detailed content.

#### Code Examples

```python
# Python example
def my_function():
    return "Hello"
```

```typescript
// TypeScript example
const myFunction = (): string => {
  return "Hello";
};
```

### Tables

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

### Lists

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

### Links

[Link text](https://example.com)
[Internal link](./other-page.md)

### Images

![Alt text](/assets/images/screenshot.png)

### Admonitions

> **Note**: This is a note.

> **Warning**: This is a warning.

> **Tip**: This is a helpful tip.

```

### Frontmatter

Every page should have frontmatter:

```markdown
---
layout: default
title: Page Title
description: Brief description for SEO
nav_order: 2
parent: Parent Page Name
---
```

## Documentation Best Practices

### 1. Structure

- Start with overview/introduction
- Use clear hierarchical headings
- Break content into digestible sections
- Include practical examples

### 2. Writing Style

- Use present tense
- Be concise and clear
- Avoid jargon when possible
- Define technical terms
- Use active voice

### 3. Code Examples

- Include complete, runnable examples
- Add comments to explain non-obvious code
- Show both input and expected output
- Test all code examples

### 4. Images & Screenshots

- Use descriptive alt text
- Keep images up-to-date with UI
- Annotate screenshots when helpful
- Optimize image sizes

### 5. Cross-References

- Link to related documentation
- Use relative links for internal pages
- Keep links up-to-date
- Provide context for external links

## Node Documentation Template

When documenting nodes:

```markdown
---
layout: default
title: Node Name
parent: Node Category
---

# Node Name

Brief description of what the node does.

## Inputs

| Input | Type | Description | Required |
|-------|------|-------------|----------|
| input_name | string | Input description | Yes |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output_name | image | Output description |

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| prop_name | int | 10 | Property description |

## Usage Example

```python
# Example usage
node = NodeName(
    input_name="value",
    prop_name=20
)
```

## Common Use Cases

1. Use case 1
2. Use case 2

## Tips

- Tip 1
- Tip 2

## Related Nodes

- [OtherNode](./other-node.md)
- [SimilarNode](./similar-node.md)

```

## Workflow Documentation Template

```markdown
---
layout: default
title: Workflow Name
parent: Workflows
---

# Workflow Name

Brief description of the workflow.

## Overview

What this workflow does and why it's useful.

## Prerequisites

- Prerequisite 1
- Prerequisite 2

## Steps

### 1. Step One

Description and instructions.

![Step 1](/assets/workflows/step1.png)

### 2. Step Two

Description and instructions.

### 3. Step Three

Description and instructions.

## Result

Expected output description.

![Final result](/assets/workflows/result.png)

## Variations

- Variation 1
- Variation 2

## Troubleshooting

- Problem 1: Solution
- Problem 2: Solution
```

## Building and Testing Docs Locally

### Prerequisites

```bash
gem install jekyll bundler
```

### Build and Serve

```bash
cd docs
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

### Check for Broken Links

```bash
bundle exec jekyll build
# Use link checker tool
```

## SEO Best Practices

1. **Title Tags**: 50-60 characters
2. **Meta Descriptions**: 150-160 characters
3. **Headings**: Use H1-H6 hierarchically
4. **Alt Text**: Describe images for accessibility
5. **Internal Links**: Connect related content
6. **URLs**: Use descriptive, lowercase, hyphenated slugs

## Accessibility

1. **Alt Text**: Provide for all images
2. **Heading Hierarchy**: Don't skip levels
3. **Link Text**: Make it descriptive ("Learn more" vs "Click here")
4. **Color Contrast**: Ensure readable text
5. **Code Blocks**: Specify language for syntax highlighting

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [Web UI Guide](../web/src/AGENTS.md) - Web application

## Quick Reference

### Common Tasks

- Add new page: Create `.md` file with frontmatter
- Add to navigation: Set `nav_order` and `parent` in frontmatter
- Add images: Place in `/assets/images/` and reference
- Add code examples: Use fenced code blocks with language
- Update navigation: Modify `_config.yml` or page frontmatter

### File Locations

- User guides: Root `/docs` directory
- API docs: `api-reference.md`
- Node docs: `/docs/nodes/<category>/`
- Tutorials: `/docs/cookbook/`
- Dev guides: `/docs/developer/`

---

**Note**: This guide is for AI coding assistants. For user-facing documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
