from enum import Enum
from typing import Optional, List
from pydantic import Field
import pickle
from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class RandomForestCriterion(Enum):
    GINI = "gini"
    ENTROPY = "entropy"


class RandomForestLoss(Enum):
    SQUARED_ERROR = "squared_error"
    ABSOLUTE_ERROR = "absolute_error"
    FRIEDMAN_MSE = "friedman_mse"
    POISSON = "poisson"


class RandomForestClassifierNode(BaseNode):
    """
    Random Forest Classifier.
    machine learning, classification, ensemble, tree

    Use cases:
    - Complex classification tasks
    - Feature importance analysis
    - Robust to overfitting
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_estimators: int = Field(default=100, description="Number of trees in the forest")
    max_depth: Optional[int] = Field(
        default=None, description="Maximum depth of the trees"
    )
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    min_samples_leaf: int = Field(
        default=1, description="Minimum samples required at a leaf node"
    )
    criterion: RandomForestCriterion = Field(
        default=RandomForestCriterion.GINI,
        description="Function to measure quality of split ('gini' or 'entropy')",
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
            "feature_importances": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = RandomForestClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            criterion=self.criterion.value,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }


class RandomForestRegressorNode(BaseNode):
    """
    Random Forest Regressor.
    machine learning, regression, ensemble, tree

    Use cases:
    - Complex regression tasks
    - Feature importance analysis
    - Robust predictions
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_estimators: int = Field(default=100, description="Number of trees in the forest")
    max_depth: Optional[int] = Field(
        default=None, description="Maximum depth of the trees"
    )
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    min_samples_leaf: int = Field(
        default=1, description="Minimum samples required at a leaf node"
    )
    criterion: RandomForestLoss = Field(
        default=RandomForestLoss.SQUARED_ERROR,
        description="Function to measure quality of split ('squared_error', 'absolute_error', 'friedman_mse', 'poisson')",
    )
    random_state: int = Field(default=0, description="Random state for reproducibility")

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
            "feature_importances": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = RandomForestRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            criterion=self.criterion.value,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }


class GradientBoostingClassifierNode(BaseNode):
    """
    Gradient Boosting Classifier.
    machine learning, classification, ensemble, boosting

    Use cases:
    - High-performance classification
    - Handling imbalanced datasets
    - Complex decision boundaries
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_estimators: int = Field(default=100, description="Number of boosting stages")
    learning_rate: float = Field(
        default=0.1, description="Learning rate shrinks the contribution of each tree"
    )
    max_depth: int = Field(default=3, description="Maximum depth of the trees")
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    subsample: float = Field(
        default=1.0, description="Fraction of samples used for fitting the trees"
    )
    random_state: int = Field(default=0, description="Random state for reproducibility")

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
            "feature_importances": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = GradientBoostingClassifier(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            subsample=self.subsample,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }


class GradientBoostingLoss(Enum):
    SQUARED_ERROR = "squared_error"
    ABSOLUTE_ERROR = "absolute_error"
    HUBER = "huber"
    QUANTILE = "quantile"


class GradientBoostingRegressorNode(BaseNode):
    """
    Gradient Boosting Regressor.
    machine learning, regression, ensemble, boosting

    Use cases:
    - High-performance regression
    - Complex function approximation
    - Robust predictions
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    n_estimators: int = Field(default=100, description="Number of boosting stages")
    learning_rate: float = Field(
        default=0.1, description="Learning rate shrinks the contribution of each tree"
    )
    max_depth: int = Field(default=3, description="Maximum depth of the trees")
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    subsample: float = Field(
        default=1.0, description="Fraction of samples used for fitting the trees"
    )
    loss: GradientBoostingLoss = Field(
        default=GradientBoostingLoss.SQUARED_ERROR,
        description="Loss function to be optimized ('squared_error', 'absolute_error', 'huber', 'quantile')",
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
            "feature_importances": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = GradientBoostingRegressor(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            subsample=self.subsample,
            loss=self.loss.value,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }
