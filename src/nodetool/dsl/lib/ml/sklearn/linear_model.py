from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LassoRegressionNode(GraphNode):
    """
    Fits a lasso regression model (L1 regularization).
    machine learning, regression, regularization, feature selection

    Use cases:
    - Feature selection
    - Sparse solutions
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Regularization strength')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.linear_model.LassoRegression"



class LinearRegressionNode(GraphNode):
    """
    Fits a linear regression model.
    machine learning, regression, linear model

    Use cases:
    - Predict continuous values
    - Find linear relationships between variables
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    fit_intercept: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to calculate the intercept')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.linear_model.LinearRegression"



class LogisticRegressionNode(GraphNode):
    """
    Fits a logistic regression model for classification.
    machine learning, classification, logistic regression

    Use cases:
    - Binary classification problems
    - Probability estimation
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values (binary)')
    C: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Inverse of regularization strength')
    max_iter: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Maximum number of iterations')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.linear_model.LogisticRegression"



class RidgeRegressionNode(GraphNode):
    """
    Fits a ridge regression model (L2 regularization).
    machine learning, regression, regularization

    Use cases:
    - Handle multicollinearity
    - Prevent overfitting
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Regularization strength')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.linear_model.RidgeRegression"


