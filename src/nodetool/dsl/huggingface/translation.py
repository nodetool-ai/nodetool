from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.huggingface.translation
import nodetool.nodes.huggingface.translation

class Translation(GraphNode):
    """
    Translates text from one language to another.
    text, translation, natural language processing

    Use cases:
    - Multilingual content creation
    - Cross-language communication
    - Localization of applications and websites

    Note: some models support more languages than others.
    """

    LanguageCode: typing.ClassVar[type] = nodetool.nodes.huggingface.translation.Translation.LanguageCode
    LanguageCode: typing.ClassVar[type] = nodetool.nodes.huggingface.translation.Translation.LanguageCode
    model: HFTranslation | GraphNode | tuple[GraphNode, str] = Field(default=HFTranslation(type='hf.translation', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for translation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to translate')
    source_lang: nodetool.nodes.huggingface.translation.Translation.LanguageCode = Field(default=LanguageCode.ENGLISH, description="The source language code (e.g., 'en' for English)")
    target_lang: nodetool.nodes.huggingface.translation.Translation.LanguageCode = Field(default=LanguageCode.FRENCH, description="The target language code (e.g., 'fr' for French)")

    @classmethod
    def get_node_type(cls): return "huggingface.translation.Translation"


