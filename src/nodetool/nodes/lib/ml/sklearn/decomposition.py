import enum
from typing import Optional
from pydantic import Field
import pickle
from sklearn.decomposition import PCA, NMF, TruncatedSVD
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class PCANode(BaseNode):
    """
    Principal Component Analysis for dimensionality reduction.
    machine learning, dimensionality reduction, feature extraction

    Use cases:
    - Dimensionality reduction
    - Feature extraction
    - Data visualization
    """

    X: NPArray = Field(default=NPArray(), description="Features for decomposition")
    n_components: Optional[int] = Field(
        default=None, description="Number of components to keep"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "components": NPArray,
            "explained_variance_ratio": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = PCA(n_components=self.n_components, random_state=self.random_state)
        transformed = model.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "components": NPArray.from_numpy(model.components_),
            "explained_variance_ratio": NPArray.from_numpy(
                model.explained_variance_ratio_
            ),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class NMFInit(str, enum.Enum):
    RANDOM = "random"
    NNDSVD = "nndsvd"
    NNDSVDA = "nndsvda"
    NNDSVDAR = "nndsvdar"
    CUSTOM = "custom"


class NMFNode(BaseNode):
    """
    Non-Negative Matrix Factorization.
    machine learning, dimensionality reduction, feature extraction

    Use cases:
    - Topic modeling
    - Source separation
    - Feature extraction for non-negative data
    """

    X: NPArray = Field(
        default=NPArray(), description="Non-negative features for decomposition"
    )
    n_components: int = Field(default=2, description="Number of components")
    init: NMFInit = Field(
        default=NMFInit.RANDOM, description="Method for initialization"
    )
    random_state: int = Field(default=0, description="Random state for reproducibility")
    max_iter: int = Field(default=200, description="Maximum number of iterations")

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "components": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = NMF(
            n_components=self.n_components,
            init=self.init,
            random_state=self.random_state,
            max_iter=self.max_iter,
        )
        transformed = model.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "components": NPArray.from_numpy(model.components_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class TruncatedSVDNode(BaseNode):
    """
    Truncated Singular Value Decomposition (LSA).
    machine learning, dimensionality reduction, feature extraction

    Use cases:
    - Text processing (LSA/LSI)
    - Dimensionality reduction for sparse data
    - Feature extraction
    """

    X: NPArray = Field(default=NPArray(), description="Features for decomposition")
    n_components: int = Field(default=2, description="Number of components")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )
    n_iter: int = Field(
        default=5, description="Number of iterations for randomized SVD"
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "components": NPArray,
            "explained_variance_ratio": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = TruncatedSVD(
            n_components=self.n_components,
            random_state=self.random_state,
            n_iter=self.n_iter,
        )
        transformed = model.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "components": NPArray.from_numpy(model.components_),
            "explained_variance_ratio": NPArray.from_numpy(
                model.explained_variance_ratio_
            ),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }
