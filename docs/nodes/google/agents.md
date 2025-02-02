# nodetool.nodes.google.agents

## ChainOfThought

Gemini version of chain-of-thought reasoning node for breaking down complex problems into clear steps.
Use cases:
- Analyzing complex problems step by step
- Breaking down solutions into logical steps
- Providing detailed reasoning for decisions

**Tags:** agent, reasoning, analysis, problem-solving

**Fields:**
- **messages**: The messages to analyze (list[nodetool.metadata.types.Message])
- **model** (GeminiModel)
- **temperature** (float)


## ChainOfThoughtResponse

## DataGenerator

Gemini version of the data generator for creating dataframes based on user prompts. Supports multimodal inputs including images and audio.
Use cases:
- Creating a dataset for a machine learning model
- Creating a dataset for a data visualization
- Creating a dataset for a data analysis

**Tags:** data, generator, dataframe, multimodal

**Fields:**
- **model**: The Gemini model to use (GeminiModel)
- **prompt**: The user prompt (str)
- **image**: Image to use for generation (ImageRef)
- **audio**: Audio to use for generation (AudioRef)
- **columns**: The columns to use in the dataframe (RecordType)
- **temperature**: Temperature for sampling (float)


## GeminiAgent

Gemini version of the Agent node for task planning and goal decomposition.
Use cases:
- Breaking down complex tasks into smaller steps
- Creating task dependencies and workflows
- Planning multi-step processes

**Tags:** agent, planning, task, decomposition

**Fields:**
- **goal**: The user prompt (str)
- **model**: The Gemini model to use (GeminiModel)
- **temperature**: Temperature for sampling (float)


## SVGGenerator

Gemini version of SVG generator for creating SVG elements based on user prompts.
Use cases:
- Creating vector graphics from text descriptions
- Generating scalable illustrations
- Creating custom icons and diagrams

**Tags:** svg, generator, vector, graphics

**Fields:**
- **model**: The Gemini model to use (GeminiModel)
- **prompt**: The user prompt for SVG generation (str)
- **image**: Image to use for generation (ImageRef)
- **audio**: Audio to use for generation (AudioRef)
- **temperature**: Temperature for sampling (float)


## Summarizer

Gemini version of the summarizer for creating concise summaries of text content.
Use cases:
- Condensing long documents into key points
- Creating executive summaries
- Extracting main ideas from text

**Tags:** text, summarization, nlp, content

**Fields:**
- **model**: The Gemini model to use (GeminiModel)
- **text**: The text to summarize (str)
- **max_words**: Target maximum number of words for the summary (int)
- **temperature**: Temperature for sampling (float)


## TaskSchema

## TasksResponse

## ThoughtStepSchema

### parse_svg_content

Parse SVG content string into a list of SVGElement objects using XML parser.
Maintains hierarchical structure of SVG elements.


**Args:**

- **content**: Raw SVG content string


**Returns:**

List of SVGElement objects representing the parsed SVG elements
**Args:**
- **content (str)**

**Returns:** list[nodetool.metadata.types.SVGElement]

