from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.aime.translate
import nodetool.nodes.aime.translate

class SeamlessCommunication(GraphNode):
    """
    Translates text from one language to another using the AIME API.
    """

    Language: typing.ClassVar[type] = nodetool.nodes.aime.translate.SeamlessCommunication.Language
    Language: typing.ClassVar[type] = nodetool.nodes.aime.translate.SeamlessCommunication.Language
    src_lang: nodetool.nodes.aime.translate.SeamlessCommunication.Language = Field(default=Language.GERMAN, description=None)
    tgt_lang: nodetool.nodes.aime.translate.SeamlessCommunication.Language = Field(default=Language.ENGLISH, description=None)
    generate_audio: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)
    text_input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "aime.translate.SeamlessCommunication"


