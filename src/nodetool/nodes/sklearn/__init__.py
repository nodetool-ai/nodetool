import pickle
from pydantic import Field
from nodetool.metadata.types import NPArray, SKLearnModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import nodetool.nodes.sklearn.feature_selection
import nodetool.nodes.sklearn.preprocessing
import nodetool.nodes.sklearn.neighbors
import nodetool.nodes.sklearn.linear_model
import nodetool.nodes.sklearn.datasets
import nodetool.nodes.sklearn.decomposition
import nodetool.nodes.sklearn.cluster
import nodetool.nodes.sklearn.svm
import nodetool.nodes.sklearn.tree
import nodetool.nodes.sklearn.ensemble
import nodetool.nodes.sklearn.naive_bayes
import nodetool.nodes.sklearn.model_selection
import nodetool.nodes.sklearn.impute
import nodetool.nodes.sklearn.metrics
import nodetool.nodes.sklearn.inspection
import nodetool.nodes.sklearn.visualization


class PredictNode(BaseNode):
    """
    Makes predictions using a fitted sklearn model.
    machine learning, prediction, inference

    Use cases:
    - Make predictions on new data
    - Score model performance
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Fitted sklearn model"
    )

    X: NPArray = Field(default=NPArray(), description="Features to predict on")

    async def process(self, context: ProcessingContext) -> NPArray:
        assert self.model.model, "Model is not connected"
        assert self.X.is_set(), "X is not set"

        model = pickle.loads(self.model.model)
        predictions = model.predict(self.X.to_numpy())

        return NPArray.from_numpy(predictions)
