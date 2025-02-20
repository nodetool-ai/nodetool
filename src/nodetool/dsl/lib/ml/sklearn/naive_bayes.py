from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BernoulliNBNode(GraphNode):
    """
    Bernoulli Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Text classification with binary features
    - Document classification
    - Binary feature classification
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing)')
    fit_prior: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to learn class prior probabilities')
    binarize: float | None | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Threshold for binarizing features (None for no binarization)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.naive_bayes.BernoulliNB"



class GaussianNBNode(GraphNode):
    """
    Gaussian Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Real-valued feature classification
    - Fast training and prediction
    - Baseline for classification tasks
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    var_smoothing: float | GraphNode | tuple[GraphNode, str] = Field(default=1e-09, description='Portion of the largest variance of all features that is added to variances for calculation stability')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.naive_bayes.GaussianNB"



class MultinomialNBNode(GraphNode):
    """
    Multinomial Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Text classification
    - Document categorization
    - Feature counts or frequencies
    """

    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing)')
    fit_prior: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to learn class prior probabilities')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.naive_bayes.MultinomialNB"


