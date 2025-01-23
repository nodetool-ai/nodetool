import pickle
from pydantic import Field
from nodetool.metadata.types import NPArray, SKLearnModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import nodetool.nodes.lib.ml.sklearn.feature_selection
import nodetool.nodes.lib.ml.sklearn.preprocessing
import nodetool.nodes.lib.ml.sklearn.neighbors
import nodetool.nodes.lib.ml.sklearn.linear_model
import nodetool.nodes.lib.ml.sklearn.datasets
import nodetool.nodes.lib.ml.sklearn.decomposition
import nodetool.nodes.lib.ml.sklearn.cluster
import nodetool.nodes.lib.ml.sklearn.svm
import nodetool.nodes.lib.ml.sklearn.tree
import nodetool.nodes.lib.ml.sklearn.ensemble
import nodetool.nodes.lib.ml.sklearn.naive_bayes
import nodetool.nodes.lib.ml.sklearn.model_selection
import nodetool.nodes.lib.ml.sklearn.impute
import nodetool.nodes.lib.ml.sklearn.metrics
import nodetool.nodes.lib.ml.sklearn.inspection
import nodetool.nodes.lib.ml.sklearn.visualization


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
