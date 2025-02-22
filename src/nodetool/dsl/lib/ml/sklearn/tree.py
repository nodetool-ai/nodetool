from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.lib.ml.sklearn.tree

class DecisionTreeClassifierNode(GraphNode):
    """
    Decision Tree Classifier.
    machine learning, classification, tree

    Use cases:
    - Classification with interpretable results
    - Feature importance analysis
    - Handling both numerical and categorical data
    """

    DecisionTreeCriterion: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.tree.DecisionTreeClassifierNode.DecisionTreeCriterion
    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    max_depth: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Maximum depth of the tree')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    min_samples_leaf: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Minimum samples required at a leaf node')
    criterion: nodetool.nodes.lib.ml.sklearn.tree.DecisionTreeClassifierNode.DecisionTreeCriterion = Field(default=DecisionTreeCriterion.GINI, description="Function to measure quality of split ('gini' or 'entropy')")
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.tree.DecisionTreeClassifier"


import nodetool.nodes.lib.ml.sklearn.tree

class DecisionTreeRegressorNode(GraphNode):
    """
    Decision Tree Regressor.
    machine learning, regression, tree

    Use cases:
    - Regression with interpretable results
    - Non-linear relationships
    - Feature importance analysis
    """

    DecisionTreeRegressorCriterion: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.tree.DecisionTreeRegressorNode.DecisionTreeRegressorCriterion
    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    max_depth: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Maximum depth of the tree')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    min_samples_leaf: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Minimum samples required at a leaf node')
    criterion: nodetool.nodes.lib.ml.sklearn.tree.DecisionTreeRegressorNode.DecisionTreeRegressorCriterion = Field(default=DecisionTreeRegressorCriterion.SQUARED_ERROR, description="Function to measure quality of split ('squared_error', 'friedman_mse', 'absolute_error', 'poisson')")
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.tree.DecisionTreeRegressor"


