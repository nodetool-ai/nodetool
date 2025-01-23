from enum import Enum
from typing import Optional
from pydantic import Field
import pickle
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class KMeansNode(BaseNode):
    """
    K-Means clustering algorithm.
    machine learning, clustering, unsupervised

    Use cases:
    - Customer segmentation
    - Image compression
    - Document clustering
    """

    X: NPArray = Field(default=NPArray(), description="Features for clustering")
    n_clusters: int = Field(default=8, description="Number of clusters")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )
    max_iter: int = Field(default=300, description="Maximum number of iterations")

    @classmethod
    def return_type(cls):
        return {
            "labels": NPArray,
            "centroids": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = KMeans(
            n_clusters=self.n_clusters,
            random_state=self.random_state,
            max_iter=self.max_iter,
        )
        model.fit(self.X.to_numpy())
        return {
            "labels": NPArray.from_numpy(model.labels_),
            "centroids": NPArray.from_numpy(model.cluster_centers_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class DBSCANNode(BaseNode):
    """
    Density-Based Spatial Clustering of Applications with Noise.
    machine learning, clustering, unsupervised, density-based

    Use cases:
    - Anomaly detection
    - Spatial clustering
    - Finding clusters of arbitrary shape
    """

    X: NPArray = Field(default=NPArray(), description="Features for clustering")
    eps: float = Field(
        default=0.5, description="Maximum distance between samples for neighborhood"
    )
    min_samples: int = Field(
        default=5, description="Minimum number of samples in a neighborhood"
    )
    metric: str = Field(default="euclidean", description="Metric to compute distances")

    @classmethod
    def return_type(cls):
        return {
            "labels": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = DBSCAN(
            eps=self.eps,
            min_samples=self.min_samples,
            metric=self.metric,
        )
        model.fit(self.X.to_numpy())
        return {
            "labels": NPArray.from_numpy(model.labels_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class AgglomerativeClusteringLinkage(str, Enum):
    WARD = "ward"
    COMPLETE = "complete"
    AVERAGE = "average"
    SINGLE = "single"


class AgglomerativeClusteringNode(BaseNode):
    """
    Hierarchical clustering using a bottom-up approach.
    machine learning, clustering, unsupervised, hierarchical

    Use cases:
    - Hierarchical data organization
    - Taxonomy creation
    - Document hierarchies
    """

    X: NPArray = Field(default=NPArray(), description="Features for clustering")
    n_clusters: int = Field(default=2, description="Number of clusters")
    linkage: AgglomerativeClusteringLinkage = Field(
        default=AgglomerativeClusteringLinkage.WARD,
        description="Linkage criterion: 'ward', 'complete', 'average', 'single'",
    )
    metric: str = Field(
        default="euclidean", description="Metric used for distance computation"
    )

    @classmethod
    def return_type(cls):
        return {
            "labels": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = AgglomerativeClustering(
            n_clusters=self.n_clusters,
            linkage=self.linkage.value,
            metric=self.metric,
        )
        model.fit(self.X.to_numpy())
        return {
            "labels": NPArray.from_numpy(model.labels_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }
