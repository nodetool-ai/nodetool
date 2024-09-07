# nodetool.nodes.nodetool.agents

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


## DataframeAgent

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


## ImageDownloader

Download images from URLs in a dataframe and return a list of ImageRefs.

Use cases:
- Prepare image datasets for machine learning tasks
- Archive images from web pages
- Process and analyze images extracted from websites

**Tags:** image download, web scraping, data processing

**Fields:**
- **images**: Dataframe containing image URLs and alt text. (DataframeRef)
- **base_url**: Base URL to prepend to relative image URLs. (str)
- **max_concurrent_downloads**: Maximum number of concurrent image downloads. (int)

### download_image

**Args:**
- **session (ClientSession)**
- **url (str)**
- **context (ProcessingContext)**

**Returns:** nodetool.metadata.types.ImageRef | None


## RunTasks

Process a task using specified models and tools.

Use cases:
- Executing tasks defined by AgentNode
- Coordinating between different AI models and tools
- Generating outputs based on task instructions

**Tags:** task execution, model integration, tool coordination

**Fields:**
- **tasks**: The task to process. (list[nodetool.metadata.types.Task])
- **image_nodes**: The image generation nodes to use. (list[nodetool.metadata.types.NodeRef])
- **max_tokens**: The maximum number of tokens to generate. (int)
- **temperature**: The temperature to use for sampling. (float)

### process_task

**Args:**
- **thread_id (str)**
- **task (Task)**
- **tasks_by_name (dict[str, nodetool.metadata.types.Task])**
- **context (ProcessingContext)**

**Returns:** str

### topological_sort

Perform a topological sort on the tasks to determine the order of execution.
**Args:**
- **tasks (list[nodetool.metadata.types.Task])**

**Returns:** list[nodetool.metadata.types.Task]


## WebsiteContentExtractor

Extract main content from a website, removing navigation, ads, and other non-essential elements.

Use cases:
- Clean web content for further analysis
- Extract article text from news websites
- Prepare web content for summarization

**Tags:** web scraping, content extraction, text analysis

**Fields:**
- **html_content**: The raw HTML content of the website. (str)


### extract_content

**Args:**
- **html_content (str)**

**Returns:** str

