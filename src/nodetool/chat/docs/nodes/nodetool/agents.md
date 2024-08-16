# nodetool.nodes.nodetool.agents

## AgentNode

Agent node to plan tasks to achieve a goal.

Use cases:
- Breaking down complex goals into manageable tasks
- Creating dependency graphs for multi-step processes
- Generating workflows for automated task execution

**Fields:**
model: FunctionModel
goal: str
max_tokens: int
temperature: float
top_k: int
top_p: float

## CreateImageTaskTool

Tool for creating image generation tasks.

Use cases:
- Creating detailed instructions for image generation models
- Defining dependencies between image generation tasks
- Crafting specific prompts for image generation models

## CreateRecordTool

Tool for creating data records with specified columns.

Use cases:
- Creating structured data entries from user input
- Validating and coercing data to match a predefined schema
- Building datasets with consistent structure

## CreateTextTaskTool

Tool for creating text generation tasks.

Use cases:
- Creating detailed instructions for text generation models
- Defining dependencies between text generation tasks
- Crafting specific prompts for language models

## DataframeAgent

LLM Agent to create a dataframe based on a user prompt.

Use cases:
- Generating structured data from natural language descriptions
- Creating sample datasets for testing or demonstration
- Converting unstructured text into tabular format

**Fields:**
model: FunctionModel
prompt: str
image: ImageRef
tool_name: str
tool_description: str
max_tokens: int
temperature: float
top_k: int
top_p: float
columns: RecordType

## ProcessTask

Process a task using specified models and tools.

Use cases:
- Executing tasks defined by AgentNode
- Coordinating between different AI models and tools
- Generating outputs based on task instructions

**Fields:**
model: FunctionModel
task: Task
image_nodes: list
max_tokens: int
temperature: float
top_k: int
top_p: float

