import enum
from typing import Optional, List, Dict, Union
from pydantic import Field
import pickle
import numpy as np
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class TransformedTargetRegressorNode(BaseNode):
    """
    Meta-estimator to regress on a transformed target.
    machine learning, regression, target transformation

    Use cases:
    - Log-transform regression targets
    - Box-Cox transformations
    - Custom target transformations
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    regressor: SKLearnModel = Field(description="Base regressor")
    transformer: SKLearnModel = Field(description="Target transformer")
    check_inverse: bool = Field(
        default=True,
        description="Whether to check that transform followed by inverse transform gives original targets",
    )

    async def process(self, context: ProcessingContext) -> SKLearnModel:
        if self.regressor.model is None:
            raise ValueError("Regressor is not set")
        if self.transformer.model is None:
            raise ValueError("Transformer is not set")

        base_regressor = pickle.loads(self.regressor.model)
        transformer = pickle.loads(self.transformer.model)

        model = TransformedTargetRegressor(
            regressor=base_regressor,
            transformer=transformer,
            check_inverse=self.check_inverse,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return SKLearnModel(model=pickle.dumps(model))
