from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.metadata.types

class ChartGenerator(GraphNode):
    """
    LLM Agent to create chart configurations based on natural language descriptions.
    llm, data visualization, charts

    Use cases:
    - Generating chart configurations from natural language descriptions
    - Creating data visualizations programmatically
    - Converting data analysis requirements into visual representations
    """

    SeabornPlotType: typing.ClassVar[type] = nodetool.metadata.types.ChartGenerator.SeabornPlotType
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use for chart generation.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Natural language description of the desired chart')
    plot_type: nodetool.metadata.types.ChartGenerator.SeabornPlotType = Field(default=SeabornPlotType.LINE, description='The type of plot to generate')
    data: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The data to visualize')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns available in the data.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.ChartGenerator"



class Classifier(GraphNode):
    """
    LLM Agent to classify text into predefined categories.
    llm, classification, text analysis

    Use cases:
    - Text categorization
    - Sentiment analysis
    - Topic classification
    - Intent detection
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use for classification.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    input_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to classify')
    labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Comma-separated list of possible classification labels')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.Classifier"



class DataExtractor(GraphNode):
    """
    LLM Agent to extract structured data from text based on a provided JSON schema.
    llm, data extraction, text analysis

    Use cases:
    - Extract specific fields from unstructured text
    - Convert text to structured data formats
    - Information extraction from documents
    - Named entity recognition with specific schema
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to extract data from')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The system prompt to use for the model.')
    json_schema: JSONRef | GraphNode | tuple[GraphNode, str] = Field(default=JSONRef(type='json', uri='', asset_id=None, data=None), description='The JSON schema that defines the structure of the output. Must be an object type.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.DataExtractor"



class DataGenerator(GraphNode):
    """
    LLM Agent to create a dataframe based on a user prompt.
    llm, dataframe creation, data structuring

    Use cases:
    - Generating structured data from natural language descriptions
    - Creating sample datasets for testing or demonstration
    - Converting unstructured text into tabular format
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns to use in the dataframe.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.DataGenerator"



class RegressionAnalyst(GraphNode):
    """
    Agent that performs regression analysis on a given dataframe and provides insights.
    llm, regression analysis, statistics

    Use cases:
    - Performing linear regression on datasets
    - Interpreting regression results like a data scientist
    - Providing statistical summaries and insights
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use for regression analysis.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt or question regarding the data analysis.')
    data: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The dataframe to perform regression on.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.RegressionAnalyst"



class SVGGenerator(GraphNode):
    """
    LLM Agent to create SVG elements based on a user prompt.
    llm, svg generation, vector graphics

    Use cases:
    - Generating SVG graphics from natural language descriptions
    - Creating vector illustrations programmatically
    - Converting text descriptions into visual elements
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt for SVG generation')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.SVGGenerator"



class SchemaGenerator(GraphNode):
    """
    LLM Agent to generate structured data based on a provided JSON schema.
    llm, json schema, data generation, structured data

    Use cases:
    - Generate sample data matching a specific schema
    - Create test data with specific structure
    - Convert natural language to structured data
    - Populate templates with generated content
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt for data generation')
    schema: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The JSON schema that defines the structure of the output')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.SchemaGenerator"



class SummarizeChunks(GraphNode):
    """
    LLM Agent to break down and summarize long text into manageable chunks.
    llm, summarization, text processing

    Use cases:
    - Breaking down long documents
    - Initial summarization of large texts
    - Preparing content for final summarization
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use for summarization.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='\n        Create a summary following these rules:\n        • Focus ONLY on the key information from the source text\n        • Maintain a neutral, objective tone throughout\n        • Present information in a logical flow\n        • Remove any redundant points\n        • Keep only the most important ideas and relationships\n        * NO CONCLUSION\n        * NO INTRODUCTION\n        * NO EXPLANATION OR ADDITIONAL TEXT\n        * ONLY RESPOND WITH THE SUMMARY', description='Instruction for summarizing individual chunks of text')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to summarize')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    num_predict: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='Number of tokens to predict for each chunk')
    chunk_overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of tokens to overlap between chunks')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.SummarizeChunks"



class Summarizer(GraphNode):
    """
    LLM Agent to summarize text
    llm, summarization, text processing

    Use cases:
    - Creating final summaries from multiple sources
    - Combining chapter summaries
    - Generating executive summaries
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use for summarization.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Create a summary following these rules:\n• Focus ONLY on the key information from the source text\n• Maintain a neutral, objective tone throughout\n• Present information in a logical flow\n• Remove any redundant points\n• Keep only the most important ideas and relationships\n* NO CONCLUSION\n* NO INTRODUCTION\n* NO EXPLANATION OR ADDITIONAL TEXT\n* ONLY RESPOND WITH THE SUMMARY', description='Instruction for creating the final summary')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to summarize')
    num_predict: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='Number of tokens to predict')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.agents.Summarizer"


