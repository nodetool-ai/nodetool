from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.google.gemini

class ChainOfThought(GraphNode):
    """
    Gemini version of chain-of-thought reasoning node for breaking down complex problems into clear steps.
    agent, reasoning, analysis, problem-solving
    Use cases:
    - Analyzing complex problems step by step
    - Breaking down solutions into logical steps
    - Providing detailed reasoning for decisions
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.ChainOfThought.GeminiModel
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The messages to analyze')
    model: nodetool.nodes.google.gemini.ChainOfThought.GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp, description=None)
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "google.agents.ChainOfThought"


import nodetool.nodes.google.gemini

class DataGenerator(GraphNode):
    """
    Gemini version of the data generator for creating dataframes based on user prompts. Supports multimodal inputs including images and audio.
    data, generator, dataframe, multimodal
    Use cases:
    - Creating a dataset for a machine learning model
    - Creating a dataset for a data visualization
    - Creating a dataset for a data analysis
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.DataGenerator.GeminiModel
    model: nodetool.nodes.google.gemini.DataGenerator.GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp, description='The Gemini model to use')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to use for generation')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Audio to use for generation')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns to use in the dataframe')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Temperature for sampling')

    @classmethod
    def get_node_type(cls): return "google.agents.DataGenerator"


import nodetool.nodes.google.gemini

class GeminiAgent(GraphNode):
    """
    Gemini version of the Agent node for task planning and goal decomposition.
    agent, planning, task, decomposition
    Use cases:
    - Breaking down complex tasks into smaller steps
    - Creating task dependencies and workflows
    - Planning multi-step processes
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.GeminiAgent.GeminiModel
    goal: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    model: nodetool.nodes.google.gemini.GeminiAgent.GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp, description='The Gemini model to use')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Temperature for sampling')

    @classmethod
    def get_node_type(cls): return "google.agents.GeminiAgent"


import nodetool.nodes.google.gemini

class SVGGenerator(GraphNode):
    """
    Gemini version of SVG generator for creating SVG elements based on user prompts.
    svg, generator, vector, graphics
    Use cases:
    - Creating vector graphics from text descriptions
    - Generating scalable illustrations
    - Creating custom icons and diagrams
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.SVGGenerator.GeminiModel
    model: nodetool.nodes.google.gemini.SVGGenerator.GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp, description='The Gemini model to use')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt for SVG generation')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to use for generation')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Audio to use for generation')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Temperature for sampling')

    @classmethod
    def get_node_type(cls): return "google.agents.SVGGenerator"


import nodetool.nodes.google.gemini

class Summarizer(GraphNode):
    """
    Gemini version of the summarizer for creating concise summaries of text content.
    text, summarization, nlp, content
    Use cases:
    - Condensing long documents into key points
    - Creating executive summaries
    - Extracting main ideas from text
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.Summarizer.GeminiModel
    model: nodetool.nodes.google.gemini.Summarizer.GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp, description='The Gemini model to use')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to summarize')
    max_words: int | GraphNode | tuple[GraphNode, str] = Field(default=150, description='Target maximum number of words for the summary')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Temperature for sampling')

    @classmethod
    def get_node_type(cls): return "google.agents.Summarizer"


