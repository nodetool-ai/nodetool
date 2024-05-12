from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Add(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Add"



class BinaryOperation(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.BinaryOperation"



class Cosine(GraphNode):
    angle_rad: float | int | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Cosine"



class Divide(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Divide"



class Modulus(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Modulus"



class Multiply(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Multiply"



class Power(GraphNode):
    base: float | int | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    exponent: float | int | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Power"



class Sine(GraphNode):
    angle_rad: float | int | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Sine"



class SqrtTensor(GraphNode):
    x: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.SqrtTensor"



class Subtract(GraphNode):
    a: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.math.Subtract"


