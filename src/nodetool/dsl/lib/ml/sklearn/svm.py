from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LinearSVMClassifierNode(GraphNode):
    """
    Linear Support Vector Machine Classifier.
    machine learning, classification, svm, linear

    Use cases:
    - Large-scale classification
    - Text classification
    - High-dimensional data
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    C: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Regularization parameter')
    max_iter: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='Maximum number of iterations')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.svm.LinearSVMClassifier"



class SVMClassifierNode(GraphNode):
    """
    Support Vector Machine Classifier with kernel.
    machine learning, classification, svm

    Use cases:
    - Binary and multiclass classification
    - Non-linear classification
    - Text classification
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    C: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Regularization parameter')
    kernel: str | GraphNode | tuple[GraphNode, str] = Field(default='rbf', description="Kernel type: 'linear', 'poly', 'rbf', 'sigmoid'")
    degree: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Degree of polynomial kernel function')
    gamma: str | GraphNode | tuple[GraphNode, str] = Field(default='scale', description="Kernel coefficient for 'rbf', 'poly' and 'sigmoid'")
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.svm.SVMClassifier"



class SVMRegressorNode(GraphNode):
    """
    Support Vector Machine Regressor.
    machine learning, regression, svm

    Use cases:
    - Non-linear regression
    - Robust regression
    - Time series prediction
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    C: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Regularization parameter')
    kernel: str | GraphNode | tuple[GraphNode, str] = Field(default='rbf', description="Kernel type: 'linear', 'poly', 'rbf', 'sigmoid'")
    degree: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Degree of polynomial kernel function')
    gamma: str | GraphNode | tuple[GraphNode, str] = Field(default='scale', description="Kernel coefficient for 'rbf', 'poly' and 'sigmoid'")
    epsilon: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Epsilon in the epsilon-SVR model')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.svm.SVMRegressor"


