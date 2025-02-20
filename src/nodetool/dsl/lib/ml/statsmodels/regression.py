from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class OLSNode(GraphNode):
    """
    Ordinary Least Squares Regression.
    statistics, regression, linear model

    Use cases:
    - Linear regression analysis
    - Statistical inference
    - Hypothesis testing
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features/independent variables')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target/dependent variable')
    add_constant: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Add a constant term to the model')

    @classmethod
    def get_node_type(cls): return "lib.ml.statsmodels.regression.OLS"



class WLSNode(GraphNode):
    """
    Weighted Least Squares Regression.
    statistics, regression, linear model, weighted

    Use cases:
    - Heteroscedastic data
    - Varying observation reliability
    - Weighted regression analysis
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features/independent variables')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target/dependent variable')
    weights: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Weights for observations')
    add_constant: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Add a constant term to the model')

    @classmethod
    def get_node_type(cls): return "lib.ml.statsmodels.regression.WLS"


