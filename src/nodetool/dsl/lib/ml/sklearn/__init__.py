from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class PredictNode(GraphNode):
    """
    Makes predictions using a fitted sklearn model.
    machine learning, prediction, inference

    Use cases:
    - Make predictions on new data
    - Score model performance
    """

    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted sklearn model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to predict on')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.Predict"


