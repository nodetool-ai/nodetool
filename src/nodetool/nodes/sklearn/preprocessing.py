import enum
from typing import Optional, List
from pydantic import Field
import pickle
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, Normalizer
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class StandardScalerNode(BaseNode):
    """
    Standardize features by removing the mean and scaling to unit variance.
    machine learning, preprocessing, scaling

    Use cases:
    - Feature normalization
    - Preparing data for ML algorithms
    - Handling different scales in features
    """

    X: NPArray = Field(default=NPArray(), description="Features to standardize")
    with_mean: bool = Field(
        default=True, description="If True, center the data before scaling"
    )
    with_std: bool = Field(
        default=True, description="If True, scale the data to unit variance"
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        scaler = StandardScaler(with_mean=self.with_mean, with_std=self.with_std)
        transformed = scaler.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(scaler)),
        }


class MinMaxScalerNode(BaseNode):
    """
    Scale features to a given range.
    machine learning, preprocessing, scaling

    Use cases:
    - Feature scaling to fixed range
    - Neural network input preparation
    - Image processing
    """

    X: NPArray = Field(default=NPArray(), description="Features to scale")
    feature_range: tuple = Field(
        default=(0, 1), description="Desired range of transformed data"
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        scaler = MinMaxScaler(feature_range=self.feature_range)
        transformed = scaler.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(scaler)),
        }


class RobustScalerNode(BaseNode):
    """
    Scale features using statistics that are robust to outliers.
    machine learning, preprocessing, scaling, outliers

    Use cases:
    - Handling datasets with outliers
    - Robust feature scaling
    - Preprocessing for robust models
    """

    X: NPArray = Field(default=NPArray(), description="Features to scale")
    with_centering: bool = Field(
        default=True, description="If True, center the data before scaling"
    )
    with_scaling: bool = Field(
        default=True, description="If True, scale the data to unit variance"
    )
    quantile_range: tuple = Field(
        default=(25.0, 75.0),
        description="Quantile range used to calculate scale_",
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        scaler = RobustScaler(
            with_centering=self.with_centering,
            with_scaling=self.with_scaling,
            quantile_range=self.quantile_range,
        )
        transformed = scaler.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(scaler)),
        }


class NormalizerNorm(str, enum.Enum):
    L1 = "l1"
    L2 = "l2"
    MAX = "max"


class NormalizerNode(BaseNode):
    """
    Normalize samples individually to unit norm.
    machine learning, preprocessing, normalization

    Use cases:
    - Text classification
    - Feature normalization
    - Preparing data for cosine similarity
    """

    X: NPArray = Field(default=NPArray(), description="Features to normalize")
    norm: NormalizerNorm = Field(
        default=NormalizerNorm.MAX,
        description="The norm to use: 'l1', 'l2', or 'max'",
    )

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        normalizer = Normalizer(norm=self.norm.value)
        transformed = normalizer.fit_transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
            "model": SKLearnModel(model=pickle.dumps(normalizer)),
        }


class TransformNode(BaseNode):
    """
    Transform new data using a fitted preprocessing model.
        machine learning, preprocessing, transformation

        Use cases:
        - Applying fitted preprocessing to new data
        - Consistent data transformation
        - Pipeline preprocessing
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Fitted preprocessing model"
    )
    X: NPArray = Field(default=NPArray(), description="Features to transform")

    @classmethod
    def return_type(cls):
        return {
            "transformed": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        preprocessor = pickle.loads(self.model.model)
        transformed = preprocessor.transform(self.X.to_numpy())
        return {
            "transformed": NPArray.from_numpy(transformed),
        }
