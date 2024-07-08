# nodetool.nodes.nodetool.agents

## AgentNode

Agent node to plan tasks to achieve a goal.

Use cases:
- Breaking down complex goals into manageable tasks
- Creating dependency graphs for multi-step processes
- Generating workflows for automated task execution

**Tags:** task planning, goal decomposition, workflow generation

- **model**: The language model to use. (FunctionModel)
- **goal**: The user prompt (str)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of tokens to sample from. (int)
- **top_p**: The cumulative probability for sampling. (float)

## CreateImageTaskTool

Tool for creating image generation tasks.

Use cases:
- Creating detailed instructions for image generation models
- Defining dependencies between image generation tasks
- Crafting specific prompts for image generation models

**Tags:** task creation, image generation, prompt engineering

## CreateRecordTool

Tool for creating data records with specified columns.

Use cases:
- Creating structured data entries from user input
- Validating and coercing data to match a predefined schema
- Building datasets with consistent structure

**Tags:** data creation, schema validation, type coercion

## CreateTextTaskTool

Tool for creating text generation tasks.

Use cases:
- Creating detailed instructions for text generation models
- Defining dependencies between text generation tasks
- Crafting specific prompts for language models

**Tags:** task creation, text generation, prompt engineering

## DataframeAgent

LLM Agent to create a dataframe based on a user prompt.

Use cases:
- Generating structured data from natural language descriptions
- Creating sample datasets for testing or demonstration
- Converting unstructured text into tabular format

**Tags:** llm, dataframe creation, data structuring

- **model**: The language model to use. (FunctionModel)
- **prompt**: The user prompt (str)
- **image**: The image to use in the prompt. (ImageRef)
- **tool_name**: The name of the tool to use. (str)
- **tool_description**: The description of the tool to use. (str)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of tokens to sample from. (int)
- **top_p**: The cumulative probability for sampling. (float)
- **columns**: The columns to use in the dataframe. (RecordType)

## ProcessTask

Process a task using specified models and tools.

Use cases:
- Executing tasks defined by AgentNode
- Coordinating between different AI models and tools
- Generating outputs based on task instructions

**Tags:** task execution, model integration, tool coordination

- **model**: The language model to use. (FunctionModel)
- **task**: The task to process. (Task)
- **image_nodes**: The image generation nodes to use. (list[nodetool.metadata.types.NodeRef])
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of tokens to sample from. (int)
- **top_p**: The cumulative probability for sampling. (float)

