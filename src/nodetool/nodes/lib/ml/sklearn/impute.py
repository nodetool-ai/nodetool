from typing import Optional, List, Union
from pydantic import Field
import pickle
import numpy as np
from sklearn.impute import SimpleImputer, KNNImputer
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class SimpleImputerNode(BaseNode):
    """
    Imputation transformer for completing missing values.
    machine learning, preprocessing, imputation, missing values

    Use cases:
    - Handling missing values in datasets
    - Basic data cleaning
    - Preparing data for ML models
    """

    X: NPArray = Field(default=NPArray(), description="Input data with missing values")
    strategy: str = Field(
        default="mean",
        description="Imputation strategy: 'mean', 'median', 'most_frequent', or 'constant'",
    )
    fill_value: Optional[Union[str, float]] = Field(
        default=None,
        description="Value to use when strategy is 'constant'. Can be str or numeric",
    )
    missing_values: Union[str, float] = Field(
        default=np.nan,
        description="Placeholder for missing values. Can be np.nan or numeric value",
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        imputer = SimpleImputer(
            strategy=self.strategy,
            fill_value=self.fill_value,
            missing_values=self.missing_values,
        )
        transformed = imputer.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(imputer)),
        }


class KNNImputerNode(BaseNode):
    """
    Imputation using k-Nearest Neighbors.
    machine learning, preprocessing, imputation, missing values, knn

    Use cases:
    - Advanced missing value imputation
    - Preserving data relationships
    - Handling multiple missing values
    """

    X: NPArray = Field(default=NPArray(), description="Input data with missing values")
    n_neighbors: int = Field(
        default=5,
        description="Number of neighboring samples to use for imputation",
    )
    weights: str = Field(
        default="uniform",
        description="Weight function used in prediction: 'uniform' or 'distance'",
    )
    metric: str = Field(
        default="nan_euclidean",
        description="Distance metric for searching neighbors",
    )
    missing_values: Union[str, float] = Field(
        default=np.nan,
        description="Placeholder for missing values. Can be np.nan or numeric value",
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        imputer = KNNImputer(
            n_neighbors=self.n_neighbors,
            weights=self.weights,
            metric=self.metric,
            missing_values=self.missing_values,
        )
        transformed = imputer.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(imputer)),
        }
