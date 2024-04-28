from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class HTTPDelete(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the DELETE request to.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPDelete"



class HTTPGet(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the GET request to.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPGet"



class HTTPPost(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the POST request to.')
    data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The data to send in the POST request.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPPost"



class HTTPPut(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the PUT request to.')
    data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The data to send in the PUT request.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPPut"


