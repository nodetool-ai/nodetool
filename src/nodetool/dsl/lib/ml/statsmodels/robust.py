from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.lib.ml.statsmodels.robust

class RLMNode(GraphNode):
    """
    Robust Linear Model Regression.
    statistics, regression, robust, outliers

    Use cases:
    - Regression with outliers
    - Robust parameter estimation
    - Non-normal error distributions
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features/independent variables')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target/dependent variable')
    M: nodetool.nodes.lib.ml.statsmodels.robust.RLMNode.MEstimator = Field(default=nodetool.nodes.lib.ml.statsmodels.robust.RLMNode.MEstimator('huber'), description="M-estimator ('huber', 'bisquare', etc.)")

    @classmethod
    def get_node_type(cls): return "lib.ml.statsmodels.robust.RLM"


