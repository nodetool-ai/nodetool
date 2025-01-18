# nodetool.nodes.ollama.agents

## ChartGenerator

LLM Agent to create chart configurations based on natural language descriptions.

Use cases:
- Generating chart configurations from natural language descriptions
- Creating data visualizations programmatically
- Converting data analysis requirements into visual representations

**Tags:** llm, data visualization, charts

**Fields:**
- **model**: The Llama model to use for chart generation. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: Natural language description of the desired chart (str)
- **plot_type**: The type of plot to generate (SeabornPlotType)
- **data**: The data to visualize (DataframeRef)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)
- **columns**: The columns available in the data. (RecordType)


## Classifier

LLM Agent to classify text into predefined categories.

Use cases:
- Text categorization
- Sentiment analysis
- Topic classification
- Intent detection

**Tags:** llm, classification, text analysis

**Fields:**
- **model**: The Llama model to use for classification. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **input_text**: The text to classify (str)
- **labels**: Comma-separated list of possible classification labels (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


## DataGenerator

LLM Agent to create a dataframe based on a user prompt.

Use cases:
- Generating structured data from natural language descriptions
- Creating sample datasets for testing or demonstration
- Converting unstructured text into tabular format

**Tags:** llm, dataframe creation, data structuring

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: The user prompt (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)
- **columns**: The columns to use in the dataframe. (RecordType)


## QuestionAnswerAgent

LLM Agent to generate answers based on a question and context from RAG results.

Use cases:
- Answering questions using retrieved context
- Generating coherent responses from multiple text sources
- Knowledge-based Q&A systems

**Tags:** llm, question-answering, RAG

**Fields:**
- **model**: The Llama model to use for answer generation. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **question**: The question to answer (str)
- **context**: List of context strings from RAG retrieval (list)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


## SVGGenerator

LLM Agent to create SVG elements based on a user prompt.

Use cases:
- Generating SVG graphics from natural language descriptions
- Creating vector illustrations programmatically
- Converting text descriptions into visual elements

**Tags:** llm, svg generation, vector graphics

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: The user prompt for SVG generation (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


## SchemaGenerator

LLM Agent to generate structured data based on a provided JSON schema.

Use cases:
- Generate sample data matching a specific schema
- Create test data with specific structure
- Convert natural language to structured data
- Populate templates with generated content

**Tags:** llm, json schema, data generation, structured data

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: The user prompt for data generation (str)
- **schema**: The JSON schema that defines the structure of the output (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


## SummarizeChunks

LLM Agent to break down and summarize long text into manageable chunks.

Use cases:
- Breaking down long documents
- Initial summarization of large texts
- Preparing content for final summarization

**Tags:** llm, summarization, text processing

**Fields:**
- **model**: The Llama model to use for summarization. (LlamaModel)
- **prompt**: Instruction for summarizing individual chunks of text (str)
- **text**: The text to summarize (str)
- **context_window**: The context window size to use for the model. (int)
- **num_predict**: Number of tokens to predict for each chunk (int)
- **chunk_overlap**: Number of tokens to overlap between chunks (int)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


## Summarizer

LLM Agent to summarize text

Use cases:
- Creating final summaries from multiple sources
- Combining chapter summaries
- Generating executive summaries

**Tags:** llm, summarization, text processing

**Fields:**
- **model**: The Llama model to use for summarization. (LlamaModel)
- **prompt**: Instruction for creating the final summary (str)
- **text**: The text to summarize (str)
- **num_predict**: Number of tokens to predict (int)
- **context_window**: The context window size to use for the model. (int)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)


### split_text_into_chunks

Split text into chunks with overlap.


**Use cases:**


- Summarizing long texts
- Splitting text for processing in chunks
- Creating training data for models


**Args:**

- **text**: The text to split into chunks.
- **chunk_size**: The size of each chunk.
- **overlap**: The number of tokens to overlap between chunks.
- **encoding_name**: The name of the encoding to use.


**Returns:**

A list of chunks of text.
**Args:**
- **text (str)**
- **chunk_size (int)**
- **overlap (int)**
- **encoding_name (str) (default: cl100k_base)**

**Returns:** typing.List[str]

