# nodetool.nodes.openai.agents

## Agent

Agent node to plan tasks to achieve a goal.

Use cases:
- Breaking down complex goals into manageable tasks
- Creating dependency graphs for multi-step processes
- Generating workflows for automated task execution

**Tags:** task planning, goal decomposition, workflow generation

**Fields:**
- **goal**: The user prompt (str)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **model**: The GPT model to use for generating tasks. (GPTModel)

### process_messages_with_model

Helper method to process messages based on model type
**Args:**
- **messages (list)**
- **context (ProcessingContext)**
- **kwargs**

**Returns:** Message


## ChainOfThought

Agent node that implements chain-of-thought reasoning to break down complex problems

Use cases:
- Complex problem solving requiring multiple steps
- Mathematical calculations with intermediate steps
- Logical reasoning and deduction tasks
- Step-by-step analysis of scenarios

**Tags:** into step-by-step solutions.

**Fields:**
- **messages**: The messages to use in the prompt. (list)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **model**: The GPT model to use for chain of thought reasoning. (GPTModel)


## ChainOfThoughtSummarizer

Agent node that synthesizes the results from a chain of thought reasoning process

Use cases:
- Summarizing multi-step reasoning processes
- Drawing final conclusions from step-by-step analysis
- Validating logical consistency across steps
- Generating executive summaries of complex reasoning

**Tags:** into a final, coherent conclusion.

**Fields:**
- **steps**: The completed chain of thought steps with their results (list)
- **messages**: The messages used to generate the chain of thought steps (list)
- **max_tokens**: The maximum number of tokens to generate (int)
- **temperature**: The temperature to use for sampling (float)
- **model**: The GPT model to use for summarizing chain of thought results. (GPTModel)


## ChartGenerator

LLM Agent to create chart configurations based on natural language descriptions.

Use cases:
- Generating chart configurations from natural language descriptions
- Creating data visualizations programmatically
- Converting data analysis requirements into visual representations

**Tags:** llm, data visualization, charts

**Fields:**
- **model**: The GPT model to use for chart generation. (GPTModel)
- **prompt**: Natural language description of the desired chart (str)
- **data**: The data to visualize (DataframeRef)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **columns**: The columns available in the data. (RecordType)


## DataGenerator

LLM Agent to create a dataframe based on a user prompt.

Use cases:
- Generating structured data from natural language descriptions
- Creating sample datasets for testing or demonstration
- Converting unstructured text into tabular format

**Tags:** llm, dataframe creation, data structuring

**Fields:**
- **prompt**: The user prompt (str)
- **input_text**: The input text to be analyzed by the agent. (str)
- **image**: The image to use in the prompt. (ImageRef)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **columns**: The columns to use in the dataframe. (RecordType)
- **model**: The GPT model to use for data generation. (GPTModel)


## ProcessThought

Agent node that implements iterative chain-of-thought reasoning, building upon previous steps

Use cases:
- Complex problem solving requiring multiple iterations
- Mathematical proofs with multiple steps
- Logical deductions that build upon previous conclusions
- Iterative refinement of solutions

**Tags:** to solve complex problems incrementally.

**Fields:**
- **current_step**: The current step or question to analyze (ThoughtStep)
- **max_tokens**: The maximum number of tokens to generate (int)
- **temperature**: The temperature to use for sampling (float)
- **model**: The GPT model to use for processing chain of thought steps. (GPTModel)


## RegressionAnalyst

Agent that performs regression analysis on a given dataframe and provides insights.
Use cases:
- Performing linear regression on datasets
- Interpreting regression results like a data scientist
- Providing statistical summaries and insights

**Tags:** 

**Fields:**
- **prompt**: The user prompt or question regarding the data analysis. (str)
- **data**: The dataframe to perform regression on. (DataframeRef)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **model**: The GPT model to use for regression analysis. (GPTModel)


## RunTasks

Process a task using specified models and tools.

Use cases:
- Executing tasks defined by AgentNode
- Coordinating between different AI models and tools
- Generating outputs based on task instructions

**Tags:** task execution, model integration, tool coordination

**Fields:**
- **tasks**: The task to process. (list)
- **image_nodes**: The image generation nodes to use. (list)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **model**: The GPT model to use for processing tasks. (GPTModel)

### process_task

**Args:**
- **thread_id (str)**
- **task (Task)**
- **tasks_by_name (dict)**
- **context (ProcessingContext)**

**Returns:** str

### topological_sort

Perform a topological sort on the tasks to determine the order of execution.
**Args:**
- **tasks (list)**

**Returns:** list


## SynthesizerAgent

Agent that interprets natural language descriptions to create sounds using basic synthesis algorithms.

Use cases:
- Creating sounds from text descriptions
- Automated sound design
- Converting musical ideas into synthesized audio

**Tags:** llm, audio synthesis, sound design

**Fields:**
- **prompt**: Natural language description of the desired sound (str)
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)
- **duration**: Duration of the sound in seconds. (float)
- **model**: The GPT model to use for sound synthesis. (GPTModel)


## ThoughtStep

A step in a chain-of-thought reasoning process.

**Fields:**
- **type** (typing.Literal['thought_step'])
- **step_number** (int)
- **instructions** (str)
- **reasoning** (str)
- **result** (str)


