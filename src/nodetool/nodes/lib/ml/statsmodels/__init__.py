import pickle
from pydantic import Field
from nodetool.metadata.types import NPArray, StatsModelsModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class PredictNode(BaseNode):
    """
    Make predictions using a fitted statsmodels model.
    machine learning, prediction, regression

    Use cases:
    - Making predictions with fitted models
    - Model inference
    - Out-of-sample prediction
    """

    model: StatsModelsModel = Field(
        default=StatsModelsModel(), description="Fitted statsmodels model"
    )

    X: NPArray = Field(default=NPArray(), description="Features to predict on")

    async def process(self, context: ProcessingContext) -> NPArray:
        assert self.model.model, "Model is not connected"
        assert self.X.is_set(), "X is not set"

        model = pickle.loads(self.model.model)
        predictions = model.predict(self.X.to_numpy())

        return NPArray.from_numpy(predictions)
