from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class PrimitiveNode(GraphNode):

    @classmethod
    def get_node_type(cls): return "comfy.Primitive"



class Reroute(GraphNode):

    @classmethod
    def get_node_type(cls): return "comfy.Reroute"


