from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.lib.ml.sklearn.neighbors
import nodetool.nodes.lib.ml.sklearn.neighbors

class KNNClassifierNode(GraphNode):
    """
    K-Nearest Neighbors Classifier.
    machine learning, classification, neighbors

    Use cases:
    - Pattern recognition
    - Classification based on similar examples
    - Non-parametric classification
    """

    KNNWeights: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.neighbors.KNNClassifierNode.KNNWeights
    KNNMetric: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.neighbors.KNNClassifierNode.KNNMetric
    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_neighbors: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of neighbors')
    weights: nodetool.nodes.lib.ml.sklearn.neighbors.KNNClassifierNode.KNNWeights = Field(default=KNNWeights.UNIFORM, description="Weight function used in prediction ('uniform' or 'distance')")
    metric: nodetool.nodes.lib.ml.sklearn.neighbors.KNNClassifierNode.KNNMetric = Field(default=KNNMetric.EUCLIDEAN, description='Distance metric to use')
    p: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Power parameter for Minkowski metric (p=2 is Euclidean)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.neighbors.KNNClassifier"


import nodetool.nodes.lib.ml.sklearn.neighbors
import nodetool.nodes.lib.ml.sklearn.neighbors

class KNNRegressorNode(GraphNode):
    """
    K-Nearest Neighbors Regressor.
    machine learning, regression, neighbors

    Use cases:
    - Non-parametric regression
    - Local approximation
    - Continuous value prediction
    """

    KNNWeights: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.neighbors.KNNRegressorNode.KNNWeights
    KNNMetric: typing.ClassVar[type] = nodetool.nodes.lib.ml.sklearn.neighbors.KNNRegressorNode.KNNMetric
    X_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y_train: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training target values')
    n_neighbors: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of neighbors')
    weights: nodetool.nodes.lib.ml.sklearn.neighbors.KNNRegressorNode.KNNWeights = Field(default=KNNWeights.UNIFORM, description="Weight function used in prediction ('uniform' or 'distance')")
    metric: nodetool.nodes.lib.ml.sklearn.neighbors.KNNRegressorNode.KNNMetric = Field(default=KNNMetric.EUCLIDEAN, description='Distance metric to use')
    p: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Power parameter for Minkowski metric (p=2 is Euclidean)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.neighbors.KNNRegressor"



class NearestNeighbors(GraphNode):
    """
    Stores input embeddings in a database and retrieves the nearest neighbors for a query embedding.
    array, embeddings, nearest neighbors, search, similarity
    """

    documents: list[NPArray] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The list of documents to search')
    query: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The query to search for')
    n_neighbors: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of neighbors to return')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.neighbors.NearestNeighbors"


