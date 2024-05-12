from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Abs(GraphNode):
    input_tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input tensor to compute the absolute values from.')
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Abs"



class ArgMax(GraphNode):
    a: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ArgMax"



class ArgMin(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ArgMin"



class Exp(GraphNode):
    x: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Exp"



class ListToTensor(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ListToTensor"



class Log(GraphNode):
    x: int | float | nodetool.metadata.types.Tensor | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Log"



class MatMul(GraphNode):
    a: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    b: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.MatMul"



class Max(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Max"



class Mean(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Mean"



class Min(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Min"



class PlotTSNE(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    color_indices: list[int] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    perplexity: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.PlotTSNE"


from nodetool.nodes.nodetool.tensor import PlotType

class PlotTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    plot_type: PlotType | GraphNode | tuple[GraphNode, str] = Field(default=PlotType('line'), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.PlotTensor"



class ScalarToTensor(GraphNode):
    value: float | int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ScalarToTensor"



class Stack(GraphNode):
    tensors: list[Tensor] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    axis: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The axis to stack along.')
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Stack"



class Sum(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Sum"



class TensorToList(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.TensorToList"



class TensorToScalar(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.TensorToScalar"



class Transpose(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.Transpose"


