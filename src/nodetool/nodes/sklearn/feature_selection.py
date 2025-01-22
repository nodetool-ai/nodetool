from typing import Optional, List
from pydantic import Field
import pickle
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif, f_regression, RFE
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class SelectKBestNode(BaseNode):
    """
    Select features according to k highest scores.
    machine learning, feature selection, statistical tests

    Use cases:
    - Dimensionality reduction
    - Feature importance ranking
    - Removing irrelevant features
    """

    X: NPArray = Field(default=NPArray(), description="Features to select from")
    y: NPArray = Field(default=NPArray(), description="Target values")
    k: int = Field(default=10, description="Number of top features to select")
    score_func: str = Field(
        default="f_classif",
        description="Scoring function ('f_classif' for classification, 'f_regression' for regression)",
    )

    @classmethod
    def return_type(cls):
        return {
            "selected_features": NPArray,
            "scores": NPArray,
            "selected_mask": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        score_function = f_classif if self.score_func == "f_classif" else f_regression
        selector = SelectKBest(score_func=score_function, k=self.k)
        selected_features = selector.fit_transform(self.X.to_numpy(), self.y.to_numpy())

        return {
            "selected_features": NPArray.from_numpy(selected_features),
            "scores": NPArray.from_numpy(selector.scores_),
            "selected_mask": NPArray.from_numpy(selector.get_support()),
            "model": SKLearnModel(model=pickle.dumps(selector)),
        }


class RecursiveFeatureEliminationNode(BaseNode):
    """
    Feature ranking with recursive feature elimination.
    machine learning, feature selection, recursive elimination

    Use cases:
    - Feature ranking
    - Optimal feature subset selection
    - Model-based feature selection
    """

    X: NPArray = Field(default=NPArray(), description="Features to select from")
    y: NPArray = Field(default=NPArray(), description="Target values")
    estimator: SKLearnModel = Field(description="Base estimator for feature selection")
    n_features_to_select: Optional[int] = Field(
        default=None, description="Number of features to select"
    )
    step: float = Field(
        default=1,
        description="Number of features to remove at each iteration (int) or percentage (float)",
    )

    @classmethod
    def return_type(cls):
        return {
            "selected_features": NPArray,
            "ranking": NPArray,
            "selected_mask": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        base_estimator = pickle.loads(self.estimator.model)
        selector = RFE(
            estimator=base_estimator,
            n_features_to_select=self.n_features_to_select,
            step=self.step,
        )
        selected_features = selector.fit_transform(self.X.to_numpy(), self.y.to_numpy())

        return {
            "selected_features": NPArray.from_numpy(selected_features),
            "ranking": NPArray.from_numpy(selector.ranking_),
            "selected_mask": NPArray.from_numpy(selector.support_),
            "model": SKLearnModel(model=pickle.dumps(selector)),
        }


class VarianceThresholdNode(BaseNode):
    """
    Feature selector that removes low-variance features.
    machine learning, feature selection, variance

    Use cases:
    - Remove constant features
    - Remove quasi-constant features
    - Basic feature filtering
    """

    X: NPArray = Field(default=NPArray(), description="Features to select from")
    threshold: float = Field(
        default=0.0,
        description="Features with a variance lower than this threshold will be removed",
    )

    @classmethod
    def return_type(cls):
        return {
            "selected_features": NPArray,
            "variances": NPArray,
            "selected_mask": NPArray,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        from sklearn.feature_selection import VarianceThreshold

        selector = VarianceThreshold(threshold=self.threshold)
        selected_features = selector.fit_transform(self.X.to_numpy())

        return {
            "selected_features": NPArray.from_numpy(selected_features),
            "variances": NPArray.from_numpy(selector.variances_),
            "selected_mask": NPArray.from_numpy(selector.get_support()),
            "model": SKLearnModel(model=pickle.dumps(selector)),
        }
