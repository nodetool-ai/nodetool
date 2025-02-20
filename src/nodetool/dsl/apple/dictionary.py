from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SearchDictionary(GraphNode):
    """
    Search macOS Dictionary.app using Dictionary Services API
    dictionary, automation, macos, reference

    Use cases:
    - Look up word definitions programmatically
    - Check spelling and usage
    - Access dictionary content in workflows
    """

    term: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Word or phrase to look up in the dictionary')
    max_results: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Maximum number of definitions to return')

    @classmethod
    def get_node_type(cls): return "apple.dictionary.SearchDictionary"


