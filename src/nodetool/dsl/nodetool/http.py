from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class HTTPBaseNode(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPBase"



class HTTPDelete(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPDelete"



class HTTPGet(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPGet"



class HTTPHead(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPHead"



class HTTPPost(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The data to send in the POST request.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPPost"



class HTTPPut(GraphNode):
    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to make the request to.')
    headers: dict[str, str] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Optional headers to include in the request.')
    allow_redirects: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to follow redirects.')
    auth: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Authentication credentials.')
    data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The data to send in the PUT request.')
    @classmethod
    def get_node_type(cls): return "nodetool.http.HTTPPut"


