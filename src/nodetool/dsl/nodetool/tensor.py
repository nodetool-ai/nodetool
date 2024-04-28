from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AbsTensor(GraphNode):
    input_tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input tensor to compute the absolute values from.')
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.AbsTensor"



class ArgMaxTensor(GraphNode):
    a: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ArgMaxTensor"



class ArgMinTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.ArgMinTensor"



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



class MatMulTensor(GraphNode):
    a: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    b: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.MatMulTensor"



class MaxTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.MaxTensor"



class MeanTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.MeanTensor"



class MinTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.MinTensor"



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



class SumTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.SumTensor"



class TensorToList(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.TensorToList"



class TensorToScalar(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.TensorToScalar"



class TransposeTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.tensor.TransposeTensor"


