from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class KNNImputerNode(GraphNode):
    """
    Imputation using k-Nearest Neighbors.
    machine learning, preprocessing, imputation, missing values, knn

    Use cases:
    - Advanced missing value imputation
    - Preserving data relationships
    - Handling multiple missing values
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input data with missing values')
    n_neighbors: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of neighboring samples to use for imputation')
    weights: str | GraphNode | tuple[GraphNode, str] = Field(default='uniform', description="Weight function used in prediction: 'uniform' or 'distance'")
    metric: str | GraphNode | tuple[GraphNode, str] = Field(default='nan_euclidean', description='Distance metric for searching neighbors')
    missing_values: Union | GraphNode | tuple[GraphNode, str] = Field(default=nan, description='Placeholder for missing values. Can be np.nan or numeric value')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.impute.KNNImputer"



class SimpleImputerNode(GraphNode):
    """
    Imputation transformer for completing missing values.
    machine learning, preprocessing, imputation, missing values

    Use cases:
    - Handling missing values in datasets
    - Basic data cleaning
    - Preparing data for ML models
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input data with missing values')
    strategy: str | GraphNode | tuple[GraphNode, str] = Field(default='mean', description="Imputation strategy: 'mean', 'median', 'most_frequent', or 'constant'")
    fill_value: Union | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Value to use when strategy is 'constant'. Can be str or numeric")
    missing_values: Union | GraphNode | tuple[GraphNode, str] = Field(default=nan, description='Placeholder for missing values. Can be np.nan or numeric value')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.impute.SimpleImputer"


