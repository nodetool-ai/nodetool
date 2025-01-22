from typing import Optional, Dict, Any, List
from pydantic import Field
import pickle
import numpy as np
from sklearn.model_selection import train_test_split, KFold, GridSearchCV
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class TrainTestSplitNode(BaseNode):
    """
    Split arrays into random train and test subsets.
    machine learning, data splitting, model evaluation

    Use cases:
    - Preparing data for model training
    - Model evaluation
    - Preventing data leakage
    """

    X: NPArray = Field(default=NPArray(), description="Features to split")
    y: NPArray = Field(default=NPArray(), description="Target values to split")
    test_size: float = Field(
        default=0.25,
        description="Proportion of the dataset to include in the test split",
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )
    shuffle: bool = Field(default=True, description="Whether to shuffle the data")

    @classmethod
    def return_type(cls):
        return {
            "X_train": NPArray,
            "X_test": NPArray,
            "y_train": NPArray,
            "y_test": NPArray,
        }

    async def process(self, context: ProcessingContext):
        X_train, X_test, y_train, y_test = train_test_split(
            self.X.to_numpy(),
            self.y.to_numpy(),
            test_size=self.test_size,
            random_state=self.random_state,
            shuffle=self.shuffle,
        )
        return {
            "X_train": NPArray.from_numpy(X_train),
            "X_test": NPArray.from_numpy(X_test),
            "y_train": NPArray.from_numpy(y_train),
            "y_test": NPArray.from_numpy(y_test),
        }


class KFoldCrossValidationNode(BaseNode):
    """
    K-Fold Cross Validation for model evaluation.
    machine learning, model evaluation, cross validation

    Use cases:
    - Model performance estimation
    - Hyperparameter tuning
    - Assessing model stability
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Sklearn model to evaluate"
    )
    X: NPArray = Field(default=NPArray(), description="Features for cross validation")
    y: NPArray = Field(default=NPArray(), description="Target values")
    n_splits: int = Field(default=5, description="Number of folds")
    shuffle: bool = Field(default=True, description="Whether to shuffle the data")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "scores": NPArray,
            "mean_score": float,
            "std_score": float,
        }

    async def process(self, context: ProcessingContext):
        assert self.model.model is not None, "Model is not set"
        assert self.X.is_set(), "X is not set"
        assert self.y.is_set(), "y is not set"

        model = pickle.loads(self.model.model)
        kf = KFold(
            n_splits=self.n_splits,
            shuffle=self.shuffle,
            random_state=self.random_state,
        )

        scores = []
        for train_idx, val_idx in kf.split(self.X.to_numpy()):
            X_train = self.X.to_numpy()[train_idx]
            y_train = self.y.to_numpy()[train_idx]
            X_val = self.X.to_numpy()[val_idx]
            y_val = self.y.to_numpy()[val_idx]

            model.fit(X_train, y_train)
            scores.append(model.score(X_val, y_val))

        scores_array = np.array(scores)
        return {
            "scores": NPArray.from_numpy(scores_array),
            "mean_score": float(np.mean(scores_array)),
            "std_score": float(np.std(scores_array)),
        }


class GridSearchNode(BaseNode):
    """
    Exhaustive search over specified parameter values.
    machine learning, hyperparameter tuning, model selection

    Use cases:
    - Hyperparameter optimization
    - Model selection
    - Automated model tuning
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Base sklearn model"
    )
    X: NPArray = Field(default=NPArray(), description="Training features")
    y: NPArray = Field(default=NPArray(), description="Training target values")
    param_grid: Dict[str, List[Any]] = Field(
        default={},
        description="Dictionary with parameters names (string) as keys and lists of parameter settings to try",
    )
    cv: int = Field(default=5, description="Number of folds for cross-validation")
    scoring: Optional[str] = Field(
        default=None, description="Scoring metric to use for evaluation"
    )

    @classmethod
    def return_type(cls):
        return {
            "best_model": SKLearnModel,
            "best_params": dict,
            "best_score": float,
            "cv_results": dict,
        }

    async def process(self, context: ProcessingContext):
        assert self.model.model is not None, "Model is not set"
        assert self.X.is_set(), "X is not set"
        assert self.y.is_set(), "y is not set"

        base_model = pickle.loads(self.model.model)
        grid_search = GridSearchCV(
            base_model,
            self.param_grid,
            cv=self.cv,
            scoring=self.scoring,
            return_train_score=True,
        )

        grid_search.fit(self.X.to_numpy(), self.y.to_numpy())

        return {
            "best_model": SKLearnModel(model=pickle.dumps(grid_search.best_estimator_)),
            "best_params": grid_search.best_params_,
            "best_score": float(grid_search.best_score_),
            "cv_results": grid_search.cv_results_,
        }
