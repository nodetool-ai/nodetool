from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import Field
import pandas as pd
from sklearn import datasets
from sklearn.utils import Bunch
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataframeRef, NPArray


class LoadIrisDataset(BaseNode):
    """
    Loads the classic Iris flower dataset.
    dataset, machine learning, classification

    Use cases:
    - Practice classification tasks
    - Learn machine learning basics
    """

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        data: Bunch = datasets.load_iris()  # type: ignore
        return {
            "data": NPArray.from_numpy(data.data),
            "target": NPArray.from_numpy(data.target),
        }


class LoadBreastCancerDataset(BaseNode):
    """
    Loads the Breast Cancer Wisconsin dataset.
    dataset, machine learning, classification, medical

    Use cases:
    - Binary classification practice
    - Medical data analysis
    """

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        data: Bunch = datasets.load_breast_cancer()  # type: ignore
        return {
            "data": NPArray.from_numpy(data.data),
            "target": NPArray.from_numpy(data.target),
        }


class LoadDiabetesDataset(BaseNode):
    """
    Loads the Diabetes dataset for regression.
    dataset, machine learning, regression, medical

    Use cases:
    - Regression analysis practice
    - Medical outcome prediction
    """

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        data: Bunch = datasets.load_diabetes()  # type: ignore
        return {
            "data": NPArray.from_numpy(data.data),
            "target": NPArray.from_numpy(data.target),
        }


class LoadBostonDataset(BaseNode):
    """
    Loads the Boston Housing dataset.
    dataset, machine learning, regression, housing

    Use cases:
    - House price prediction
    - Regression analysis practice
    """

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        data: Bunch = datasets.load_boston()  # type: ignore
        return {
            "data": NPArray.from_numpy(data.data),
            "target": NPArray.from_numpy(data.target),
        }


class LoadDigitsDataset(BaseNode):
    """
    Loads the Digits dataset (handwritten digits).
    dataset, machine learning, classification, image

    Use cases:
    - Digit recognition practice
    - Image classification basics
    """

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        data: Bunch = datasets.load_digits()  # type: ignore
        return {
            "data": NPArray.from_numpy(data.data),
            "target": NPArray.from_numpy(data.target),
        }


class MakeClassificationDataset(BaseNode):
    """
    Generates a random n-class classification problem.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing classification algorithms
    - Generating controlled test data
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=20, description="Number of features")
    n_classes: int = Field(default=2, description="Number of classes")
    n_informative: int = Field(default=2, description="Number of informative features")
    n_redundant: int = Field(default=2, description="Number of redundant features")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        X, y = datasets.make_classification(
            n_samples=self.n_samples,
            n_features=self.n_features,
            n_classes=self.n_classes,
            n_informative=self.n_informative,
            n_redundant=self.n_redundant,
            random_state=self.random_state,
        )
        return {
            "data": NPArray.from_numpy(X),
            "target": NPArray.from_numpy(y),
        }


class MakeRegressionDataset(BaseNode):
    """
    Generates a random regression problem.
    dataset, machine learning, regression, synthetic

    Use cases:
    - Testing regression algorithms
    - Generating controlled test data
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=100, description="Number of features")
    n_informative: int = Field(default=10, description="Number of informative features")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        X, y = datasets.make_regression(  # type: ignore
            n_samples=self.n_samples,
            n_features=self.n_features,
            n_informative=self.n_informative,
            noise=self.noise,
            random_state=self.random_state,
        )
        return {
            "data": NPArray.from_numpy(X),
            "target": NPArray.from_numpy(y),
        }


class MakeBlobsDataset(BaseNode):
    """
    Generates isotropic Gaussian blobs for clustering.
    dataset, machine learning, clustering, synthetic

    Use cases:
    - Testing clustering algorithms
    - Visualizing cluster separation
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=2, description="Number of features")
    centers: int = Field(default=3, description="Number of centers/clusters")
    cluster_std: float = Field(
        default=1.0, description="Standard deviation of clusters"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "data": NPArray,
            "target": NPArray,
        }

    async def process(self, context: ProcessingContext):
        X, y = datasets.make_blobs(  # type: ignore
            n_samples=self.n_samples,
            n_features=self.n_features,
            centers=self.centers,
            cluster_std=self.cluster_std,
            random_state=self.random_state,
        )
        return {
            "data": NPArray.from_numpy(X),
            "target": NPArray.from_numpy(y),
        }


class MakeMoonsDataset(BaseNode):
    """
    Generates two interleaving half circles.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating decision boundaries
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext):
        X, y = datasets.make_moons(
            n_samples=self.n_samples, noise=self.noise, random_state=self.random_state
        )
        return {
            "data": NPArray.from_numpy(X),
            "target": NPArray.from_numpy(y),
        }


class MakeCirclesDataset(BaseNode):
    """
    Generates a large circle containing a smaller circle.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating circular decision boundaries
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    factor: float = Field(
        default=0.8, description="Scale factor between inner and outer circle"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext):
        X, y = datasets.make_circles(
            n_samples=self.n_samples,
            noise=self.noise,
            factor=self.factor,
            random_state=self.random_state,
        )
        return {
            "data": NPArray.from_numpy(X),
            "target": NPArray.from_numpy(y),
        }


class LoadIrisDatasetDF(BaseNode):
    """
    Loads the classic Iris flower dataset as a dataframe.
    dataset, machine learning, classification

    Use cases:
    - Practice classification tasks
    - Learn machine learning basics
    """

    async def process(self, context: ProcessingContext) -> DataframeRef:
        data: Bunch = datasets.load_iris(as_frame=True)  # type: ignore
        df = data.data
        df["target"] = data.target
        return await context.dataframe_from_pandas(df)


class LoadBreastCancerDatasetDF(BaseNode):
    """
    Loads the Breast Cancer Wisconsin dataset as a dataframe.
    dataset, machine learning, classification, medical

    Use cases:
    - Binary classification practice
    - Medical data analysis
    """

    async def process(self, context: ProcessingContext) -> DataframeRef:
        data: Bunch = datasets.load_breast_cancer(as_frame=True)  # type: ignore
        df = data.data
        df["target"] = data.target
        return await context.dataframe_from_pandas(df)


class LoadDiabetesDatasetDF(BaseNode):
    """
    Loads the Diabetes dataset for regression as a dataframe.
    dataset, machine learning, regression, medical

    Use cases:
    - Regression analysis practice
    - Medical outcome prediction
    """

    async def process(self, context: ProcessingContext) -> DataframeRef:
        data: Bunch = datasets.load_diabetes(as_frame=True)  # type: ignore
        df = data.data
        df["target"] = data.target
        return await context.dataframe_from_pandas(df)


class LoadBostonDatasetDF(BaseNode):
    """
    Loads the Boston Housing dataset as a dataframe.
    dataset, machine learning, regression, housing

    Use cases:
    - House price prediction
    - Regression analysis practice
    """

    async def process(self, context: ProcessingContext) -> DataframeRef:
        data: Bunch = datasets.load_boston(as_frame=True)  # type: ignore
        df = data.data
        df["target"] = data.target
        return await context.dataframe_from_pandas(df)


class MakeClassificationDatasetDF(BaseNode):
    """
    Generates a random n-class classification problem as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing classification algorithms
    - Generating controlled test data
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=20, description="Number of features")
    n_classes: int = Field(default=2, description="Number of classes")
    n_informative: int = Field(default=2, description="Number of informative features")
    n_redundant: int = Field(default=2, description="Number of redundant features")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        X, y = datasets.make_classification(
            n_samples=self.n_samples,
            n_features=self.n_features,
            n_classes=self.n_classes,
            n_informative=self.n_informative,
            n_redundant=self.n_redundant,
            random_state=self.random_state,
        )
        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(X.shape[1])])
        df["target"] = y
        return await context.dataframe_from_pandas(df)


class MakeRegressionDatasetDF(BaseNode):
    """
    Generates a random regression problem as a dataframe.
    dataset, machine learning, regression, synthetic

    Use cases:
    - Testing regression algorithms
    - Generating controlled test data
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=100, description="Number of features")
    n_informative: int = Field(default=10, description="Number of informative features")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        X, y = datasets.make_regression(  # type: ignore
            n_samples=self.n_samples,
            n_features=self.n_features,
            n_informative=self.n_informative,
            noise=self.noise,
            random_state=self.random_state,
        )
        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(X.shape[1])])
        df["target"] = y
        return await context.dataframe_from_pandas(df)


class MakeBlobsDatasetDF(BaseNode):
    """
    Generates isotropic Gaussian blobs for clustering as a dataframe.
    dataset, machine learning, clustering, synthetic

    Use cases:
    - Testing clustering algorithms
    - Visualizing cluster separation
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    n_features: int = Field(default=2, description="Number of features")
    centers: int = Field(default=3, description="Number of centers/clusters")
    cluster_std: float = Field(
        default=1.0, description="Standard deviation of clusters"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        X, y = datasets.make_blobs(  # type: ignore
            n_samples=self.n_samples,
            n_features=self.n_features,
            centers=self.centers,
            cluster_std=self.cluster_std,
            random_state=self.random_state,
        )
        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(X.shape[1])])
        df["target"] = y
        return await context.dataframe_from_pandas(df)


class MakeMoonsDatasetDF(BaseNode):
    """
    Generates two interleaving half circles as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating decision boundaries
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        X, y = datasets.make_moons(
            n_samples=self.n_samples, noise=self.noise, random_state=self.random_state
        )
        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(X.shape[1])])
        df["target"] = y
        return await context.dataframe_from_pandas(df)


class MakeCirclesDatasetDF(BaseNode):
    """
    Generates a large circle containing a smaller circle as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating circular decision boundaries
    """

    n_samples: int = Field(default=100, description="Number of samples to generate")
    noise: float = Field(
        default=0.1, description="Standard deviation of gaussian noise"
    )
    factor: float = Field(
        default=0.8, description="Scale factor between inner and outer circle"
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        X, y = datasets.make_circles(
            n_samples=self.n_samples,
            noise=self.noise,
            factor=self.factor,
            random_state=self.random_state,
        )
        df = pd.DataFrame(X, columns=[f"feature_{i}" for i in range(X.shape[1])])
        df["target"] = y
        return await context.dataframe_from_pandas(df)
