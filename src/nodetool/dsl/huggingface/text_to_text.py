from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class TextToText(GraphNode):
    """
    Performs text-to-text generation tasks.
    text, generation, translation, question-answering, summarization, nlp, natural-language-processing

    Use cases:
    - Text translation
    - Text summarization
    - Paraphrasing
    - Text style transfer

    Usage:
    Start with a command like Translate, Summarize, or Q (for question)
    Follow with the text you want to translate, summarize, or answer a question about.
    Examples:
    - Translate to German: Hello
    - Summarize: The quick brown fox jumps over the lazy dog.
    - Q: Who ate the cookie? followed by the text of the cookie monster.
    """

    model: HFText2TextGeneration | GraphNode | tuple[GraphNode, str] = Field(default=HFText2TextGeneration(type='hf.text2text_generation', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the text-to-text generation')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text for the text-to-text task')
    max_length: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The maximum length of the generated text')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_text.TextToText"


