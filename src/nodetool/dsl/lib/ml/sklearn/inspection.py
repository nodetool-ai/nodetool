from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.lib.ml.sklearn.inspection

class PartialDependenceDisplayNode(GraphNode):
    """
    Create Partial Dependence Plot (PDP) visualization data.
    machine learning, model inspection, visualization

    Use cases:
    - Visualizing feature effects
    - Model interpretation
    - Feature relationship analysis
    """

    PartialDependenceKind: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.inspection.PartialDependenceDisplayNode.PartialDependenceKind
    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted sklearn model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training data')
    features: tuple[Union] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Features for which to create PDP. Can be indices for 1D or tuples for 2D')
    feature_names: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Comma separated names of features')
    grid_resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of points in the grid')
    lower_percentile: float | GraphNode | tuple[GraphNode, str] = Field(default=0.05, description='Lower percentile to compute the feature values range')
    upper_percentile: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='Upper percentile to compute the feature values range')
    kind: nodetool.nodes.lib.ml.sklearn.inspection.PartialDependenceDisplayNode.PartialDependenceKind = Field(default=PartialDependenceKind.AVERAGE, description='Kind of partial dependence result')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.inspection.PartialDependenceDisplay"


import nodetool.nodes.lib.ml.sklearn.inspection

class PartialDependenceNode(GraphNode):
    """
    Calculate Partial Dependence for features.
    machine learning, model inspection, feature effects

    Use cases:
    - Feature impact visualization
    - Model interpretation
    - Understanding feature relationships
    """

    PartialDependenceKind: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.inspection.PartialDependenceNode.PartialDependenceKind
    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted sklearn model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training data')
    features: tuple[int] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='List of features for which to calculate PD. Each element can be an int for 1D PD or a list of 2 ints for 2D')
    kind: nodetool.nodes.lib.ml.sklearn.inspection.PartialDependenceNode.PartialDependenceKind = Field(default=PartialDependenceKind.AVERAGE, description="Kind of partial dependence result: 'average' or 'individual'")
    grid_resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of equally spaced points in the grid')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.inspection.PartialDependence"



class PermutationImportanceNode(GraphNode):
    """
    Calculate Permutation Feature Importance.
    machine learning, model inspection, feature importance

    Use cases:
    - Feature selection
    - Model interpretation
    - Identifying key predictors
    """

    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted sklearn model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Validation data')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='True labels/values')
    n_repeats: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of times to permute each feature')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')
    scoring: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Scoring metric (if None, uses estimator's default scorer)")
    n_jobs: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Number of jobs to run in parallel')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.inspection.PermutationImportance"


