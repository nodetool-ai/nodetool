from typing import Optional
from pydantic import Field
import pickle
from sklearn.svm import SVC, SVR, LinearSVC
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class SVMClassifierNode(BaseNode):
    """
    Support Vector Machine Classifier with kernel.
    machine learning, classification, svm

    Use cases:
    - Binary and multiclass classification
    - Non-linear classification
    - Text classification
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    C: float = Field(default=1.0, description="Regularization parameter")
    kernel: str = Field(
        default="rbf",
        description="Kernel type: 'linear', 'poly', 'rbf', 'sigmoid'",
    )
    degree: int = Field(default=3, description="Degree of polynomial kernel function")
    gamma: str = Field(
        default="scale",
        description="Kernel coefficient for 'rbf', 'poly' and 'sigmoid'",
    )
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = SVC(
            C=self.C,
            kernel=self.kernel,
            degree=self.degree,
            gamma=self.gamma,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class LinearSVMClassifierNode(BaseNode):
    """
    Linear Support Vector Machine Classifier.
    machine learning, classification, svm, linear

    Use cases:
    - Large-scale classification
    - Text classification
    - High-dimensional data
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    C: float = Field(default=1.0, description="Regularization parameter")
    max_iter: int = Field(default=1000, description="Maximum number of iterations")
    random_state: Optional[int] = Field(
        default=None, description="Random state for reproducibility"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = LinearSVC(
            C=self.C,
            max_iter=self.max_iter,
            random_state=self.random_state,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class SVMRegressorNode(BaseNode):
    """
    Support Vector Machine Regressor.
    machine learning, regression, svm

    Use cases:
    - Non-linear regression
    - Robust regression
    - Time series prediction
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    C: float = Field(default=1.0, description="Regularization parameter")
    kernel: str = Field(
        default="rbf",
        description="Kernel type: 'linear', 'poly', 'rbf', 'sigmoid'",
    )
    degree: int = Field(default=3, description="Degree of polynomial kernel function")
    gamma: str = Field(
        default="scale",
        description="Kernel coefficient for 'rbf', 'poly' and 'sigmoid'",
    )
    epsilon: float = Field(default=0.1, description="Epsilon in the epsilon-SVR model")

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = SVR(
            C=self.C,
            kernel=self.kernel,
            degree=self.degree,
            gamma=self.gamma,
            epsilon=self.epsilon,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}
