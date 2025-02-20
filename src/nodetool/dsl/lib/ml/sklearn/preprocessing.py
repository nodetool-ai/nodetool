from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class MinMaxScalerNode(GraphNode):
    """
    Scale features to a given range.
    machine learning, preprocessing, scaling

    Use cases:
    - Feature scaling to fixed range
    - Neural network input preparation
    - Image processing
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to scale')
    feature_range: tuple | GraphNode | tuple[GraphNode, str] = Field(default=(0, 1), description='Desired range of transformed data')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.preprocessing.MinMaxScaler"


import nodetool.nodes.lib.ml.sklearn.preprocessing

class NormalizerNode(GraphNode):
    """
    Normalize samples individually to unit norm.
    machine learning, preprocessing, normalization

    Use cases:
    - Text classification
    - Feature normalization
    - Preparing data for cosine similarity
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to normalize')
    norm: nodetool.nodes.lib.ml.sklearn.preprocessing.NormalizerNode.NormalizerNorm = Field(default=nodetool.nodes.lib.ml.sklearn.preprocessing.NormalizerNode.NormalizerNorm('max'), description="The norm to use: 'l1', 'l2', or 'max'")

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.preprocessing.Normalizer"



class RobustScalerNode(GraphNode):
    """
    Scale features using statistics that are robust to outliers.
    machine learning, preprocessing, scaling, outliers

    Use cases:
    - Handling datasets with outliers
    - Robust feature scaling
    - Preprocessing for robust models
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to scale')
    with_centering: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, center the data before scaling')
    with_scaling: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, scale the data to unit variance')
    quantile_range: tuple | GraphNode | tuple[GraphNode, str] = Field(default=(25.0, 75.0), description='Quantile range used to calculate scale_')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.preprocessing.RobustScaler"



class StandardScalerNode(GraphNode):
    """
    Standardize features by removing the mean and scaling to unit variance.
    machine learning, preprocessing, scaling

    Use cases:
    - Feature normalization
    - Preparing data for ML algorithms
    - Handling different scales in features
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to standardize')
    with_mean: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, center the data before scaling')
    with_std: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, scale the data to unit variance')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.preprocessing.StandardScaler"



class TransformNode(GraphNode):
    """
    Transform new data using a fitted preprocessing model.
        machine learning, preprocessing, transformation

        Use cases:
        - Applying fitted preprocessing to new data
        - Consistent data transformation
        - Pipeline preprocessing
    """

    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted preprocessing model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Features to transform')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.preprocessing.Transform"


