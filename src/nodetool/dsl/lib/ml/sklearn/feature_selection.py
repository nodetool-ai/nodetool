from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class RecursiveFeatureEliminationNode(GraphNode):
    """
    Feature ranking with recursive feature elimination.
    machine learning, feature selection, recursive elimination

    Use cases:
    - Feature ranking
    - Optimal feature subset selection
    - Model-based feature selection
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to select from')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target values')
    estimator: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Base estimator for feature selection')
    n_features_to_select: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Number of features to select')
    step: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of features to remove at each iteration (int) or percentage (float)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.feature_selection.RecursiveFeatureElimination"



class SelectKBestNode(GraphNode):
    """
    Select features according to k highest scores.
    machine learning, feature selection, statistical tests

    Use cases:
    - Dimensionality reduction
    - Feature importance ranking
    - Removing irrelevant features
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to select from')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target values')
    k: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of top features to select')
    score_func: str | GraphNode | tuple[GraphNode, str] = Field(default='f_classif', description="Scoring function ('f_classif' for classification, 'f_regression' for regression)")

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.feature_selection.SelectKBest"



class VarianceThresholdNode(GraphNode):
    """
    Feature selector that removes low-variance features.
    machine learning, feature selection, variance

    Use cases:
    - Remove constant features
    - Remove quasi-constant features
    - Basic feature filtering
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to select from')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Features with a variance lower than this threshold will be removed')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.feature_selection.VarianceThreshold"


