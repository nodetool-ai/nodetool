from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class GradientBoostingClassifierNode(GraphNode):
    """
    Gradient Boosting Classifier.
    machine learning, classification, ensemble, boosting

    Use cases:
    - High-performance classification
    - Handling imbalanced datasets
    - Complex decision boundaries
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_estimators: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of boosting stages')
    learning_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Learning rate shrinks the contribution of each tree')
    max_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Maximum depth of the trees')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    subsample: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Fraction of samples used for fitting the trees')
    random_state: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.ensemble.GradientBoostingClassifier"


import nodetool.nodes.lib.ml.sklearn.ensemble

class GradientBoostingRegressorNode(GraphNode):
    """
    Gradient Boosting Regressor.
    machine learning, regression, ensemble, boosting

    Use cases:
    - High-performance regression
    - Complex function approximation
    - Robust predictions
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_estimators: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of boosting stages')
    learning_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Learning rate shrinks the contribution of each tree')
    max_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Maximum depth of the trees')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    subsample: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Fraction of samples used for fitting the trees')
    loss: nodetool.nodes.lib.ml.sklearn.ensemble.GradientBoostingRegressorNode.GradientBoostingLoss = Field(default=nodetool.nodes.lib.ml.sklearn.ensemble.GradientBoostingRegressorNode.GradientBoostingLoss('squared_error'), description="Loss function to be optimized ('squared_error', 'absolute_error', 'huber', 'quantile')")
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.ensemble.GradientBoostingRegressor"


import nodetool.nodes.lib.ml.sklearn.ensemble

class RandomForestClassifierNode(GraphNode):
    """
    Random Forest Classifier.
    machine learning, classification, ensemble, tree

    Use cases:
    - Complex classification tasks
    - Feature importance analysis
    - Robust to overfitting
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_estimators: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of trees in the forest')
    max_depth: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Maximum depth of the trees')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    min_samples_leaf: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Minimum samples required at a leaf node')
    criterion: nodetool.nodes.lib.ml.sklearn.ensemble.RandomForestClassifierNode.RandomForestCriterion = Field(default=nodetool.nodes.lib.ml.sklearn.ensemble.RandomForestClassifierNode.RandomForestCriterion('gini'), description="Function to measure quality of split ('gini' or 'entropy')")
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.ensemble.RandomForestClassifier"


import nodetool.nodes.lib.ml.sklearn.ensemble

class RandomForestRegressorNode(GraphNode):
    """
    Random Forest Regressor.
    machine learning, regression, ensemble, tree

    Use cases:
    - Complex regression tasks
    - Feature importance analysis
    - Robust predictions
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_estimators: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of trees in the forest')
    max_depth: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Maximum depth of the trees')
    min_samples_split: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum samples required to split a node')
    min_samples_leaf: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Minimum samples required at a leaf node')
    criterion: nodetool.nodes.lib.ml.sklearn.ensemble.RandomForestRegressorNode.RandomForestLoss = Field(default=nodetool.nodes.lib.ml.sklearn.ensemble.RandomForestRegressorNode.RandomForestLoss('squared_error'), description="Function to measure quality of split ('squared_error', 'absolute_error', 'friedman_mse', 'poisson')")
    random_state: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.ensemble.RandomForestRegressor"


