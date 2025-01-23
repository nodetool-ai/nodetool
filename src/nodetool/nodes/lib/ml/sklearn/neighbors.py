from enum import Enum
import numpy as np
from pydantic import Field
import pickle
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class KNNWeights(str, Enum):
    UNIFORM = "uniform"
    DISTANCE = "distance"


class KNNMetric(str, Enum):
    EUCLIDEAN = "euclidean"
    MANHATTAN = "manhattan"
    CHEBYSHEV = "chebyshev"
    MINKOWSKI = "minkowski"


class KNNClassifierNode(BaseNode):
    """
    K-Nearest Neighbors Classifier.
    machine learning, classification, neighbors

    Use cases:
    - Pattern recognition
    - Classification based on similar examples
    - Non-parametric classification
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_neighbors: int = Field(default=5, description="Number of neighbors")
    weights: KNNWeights = Field(
        default=KNNWeights.UNIFORM,
        description="Weight function used in prediction ('uniform' or 'distance')",
    )
    metric: KNNMetric = Field(
        default=KNNMetric.EUCLIDEAN, description="Distance metric to use"
    )
    p: int = Field(
        default=2, description="Power parameter for Minkowski metric (p=2 is Euclidean)"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = KNeighborsClassifier(
            n_neighbors=self.n_neighbors,
            weights=self.weights.value,
            metric=self.metric,
            p=self.p,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class KNNRegressorNode(BaseNode):
    """
    K-Nearest Neighbors Regressor.
    machine learning, regression, neighbors

    Use cases:
    - Non-parametric regression
    - Local approximation
    - Continuous value prediction
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_neighbors: int = Field(default=5, description="Number of neighbors")
    weights: KNNWeights = Field(
        default=KNNWeights.UNIFORM,
        description="Weight function used in prediction ('uniform' or 'distance')",
    )
    metric: KNNMetric = Field(
        default=KNNMetric.EUCLIDEAN, description="Distance metric to use"
    )
    p: int = Field(
        default=2, description="Power parameter for Minkowski metric (p=2 is Euclidean)"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = KNeighborsRegressor(
            n_neighbors=self.n_neighbors,
            weights=self.weights.value,
            metric=self.metric,
            p=self.p,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class NearestNeighbors(BaseNode):
    """
    Stores input embeddings in a database and retrieves the nearest neighbors for a query embedding.
    array, embeddings, nearest neighbors, search, similarity
    """

    documents: list[NPArray] = Field(
        default=[], description="The list of documents to search"
    )
    query: NPArray = Field(
        default=NPArray(),
        description="The query to search for",
    )
    n_neighbors: int = Field(default=1, description="The number of neighbors to return")

    @classmethod
    def return_type(cls):
        return {
            "distances": list[float],
            "indices": list[int],
        }

    async def process(self, context: ProcessingContext):
        from sklearn.neighbors import NearestNeighbors

        embeddings = np.array([e.to_numpy() for e in self.documents])
        nbrs = NearestNeighbors(n_neighbors=self.n_neighbors).fit(embeddings)
        distances, indices = nbrs.kneighbors(self.query.to_numpy().reshape(1, -1))
        return {
            "distances": distances[0].tolist(),
            "indices": indices[0].tolist(),
        }
