# nodetool.nodes.nodetool.agents

## AgentNode

Agent node to plan tasks to achieve a goal.

**Tags:** llm, language model, agent, chat, conversation

**Inherits from:** BaseNode

- **model**: The language model to use. (`FunctionModel`)
- **goal**: The user prompt (`str`)
- **max_tokens**: The maximum number of tokens to generate. (`int`)
- **temperature**: The temperature to use for sampling. (`float`)
- **top_k**: The number of tokens to sample from. (`int`)
- **top_p**: The cumulative probability for sampling. (`float`)

## CreateImageTaskTool

**Inherits from:** Tool

## CreateRecordTool

**Inherits from:** Tool

## CreateTextTaskTool

**Inherits from:** Tool

## DataframeAgent

LLM Agent to create a dataframe based on a user prompt.

**Tags:** llm, language model, agent, chat, conversation

**Inherits from:** BaseNode

- **model**: The language model to use. (`FunctionModel`)
- **prompt**: The user prompt (`str`)
- **image**: The image to use in the prompt. (`ImageRef`)
- **tool_name**: The name of the tool to use. (`str`)
- **tool_description**: The description of the tool to use. (`str`)
- **max_tokens**: The maximum number of tokens to generate. (`int`)
- **temperature**: The temperature to use for sampling. (`float`)
- **top_k**: The number of tokens to sample from. (`int`)
- **top_p**: The cumulative probability for sampling. (`float`)
- **columns**: The columns to use in the dataframe. (`RecordType`)

## ProcessTask

Process a task with the given node.

**Tags:** llm, language model, agent, chat, conversation

**Inherits from:** BaseNode

- **model**: The language model to use. (`FunctionModel`)
- **task**: The task to process. (`Task`)
- **image_nodes**: The image generation nodes to use. (`list[nodetool.metadata.types.NodeRef]`)
- **max_tokens**: The maximum number of tokens to generate. (`int`)
- **temperature**: The temperature to use for sampling. (`float`)
- **top_k**: The number of tokens to sample from. (`int`)
- **top_p**: The cumulative probability for sampling. (`float`)

