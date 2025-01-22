from typing import Optional, List
from pydantic import Field
import pickle
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class DecisionTreeClassifierNode(BaseNode):
    """
    Decision Tree Classifier.
    machine learning, classification, tree

    Use cases:
    - Classification with interpretable results
    - Feature importance analysis
    - Handling both numerical and categorical data
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    max_depth: Optional[int] = Field(
        default=None, description="Maximum depth of the tree"
    )
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    min_samples_leaf: int = Field(
        default=1, description="Minimum samples required at a leaf node"
    )
    criterion: str = Field(
        default="gini",
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
        model = DecisionTreeClassifier(
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            criterion=self.criterion,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }


class DecisionTreeRegressorNode(BaseNode):
    """
    Decision Tree Regressor.
    machine learning, regression, tree

    Use cases:
    - Regression with interpretable results
    - Non-linear relationships
    - Feature importance analysis
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    max_depth: Optional[int] = Field(
        default=None, description="Maximum depth of the tree"
    )
    min_samples_split: int = Field(
        default=2, description="Minimum samples required to split a node"
    )
    min_samples_leaf: int = Field(
        default=1, description="Minimum samples required at a leaf node"
    )
    criterion: str = Field(
        default="squared_error",
        description="Function to measure quality of split ('squared_error', 'friedman_mse', 'absolute_error', 'poisson')",
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
        model = DecisionTreeRegressor(
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            criterion=self.criterion,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {
            "model": SKLearnModel(model=pickle.dumps(model)),
            "feature_importances": NPArray.from_numpy(model.feature_importances_),
        }
