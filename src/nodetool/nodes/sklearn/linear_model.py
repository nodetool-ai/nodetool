from typing import Optional, List
from pydantic import Field
import numpy as np
import pickle
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge, Lasso
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, DataframeRef, SKLearnModel


class LinearRegressionNode(BaseNode):
    """
    Fits a linear regression model.
    machine learning, regression, linear model

    Use cases:
    - Predict continuous values
    - Find linear relationships between variables
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")

    y_train: NPArray = Field(default=NPArray(), description="Training target values")

    fit_intercept: bool = Field(
        default=True, description="Whether to calculate the intercept"
    )

    @classmethod
    def return_type(cls):
        return {
            "coefficients": NPArray,
            "intercept": float,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = LinearRegression(fit_intercept=self.fit_intercept)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())

        return {
            "coefficients": NPArray.from_numpy(model.coef_),
            "intercept": float(model.intercept_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class LogisticRegressionNode(BaseNode):
    """
    Fits a logistic regression model for classification.
    machine learning, classification, logistic regression

    Use cases:
    - Binary classification problems
    - Probability estimation
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")

    y_train: NPArray = Field(
        default=NPArray(), description="Training target values (binary)"
    )

    C: float = Field(default=1.0, description="Inverse of regularization strength")

    max_iter: int = Field(default=100, description="Maximum number of iterations")

    @classmethod
    def return_type(cls):
        return {
            "coefficients": NPArray,
            "intercept": float,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = LogisticRegression(C=self.C, max_iter=self.max_iter)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())

        return {
            "coefficients": NPArray.from_numpy(model.coef_[0]),
            "intercept": float(model.intercept_[0]),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class RidgeRegressionNode(BaseNode):
    """
    Fits a ridge regression model (L2 regularization).
    machine learning, regression, regularization

    Use cases:
    - Handle multicollinearity
    - Prevent overfitting
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")

    y_train: NPArray = Field(default=NPArray(), description="Training target values")

    alpha: float = Field(default=1.0, description="Regularization strength")

    @classmethod
    def return_type(cls):
        return {
            "coefficients": NPArray,
            "intercept": float,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = Ridge(alpha=self.alpha)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())

        return {
            "coefficients": NPArray.from_numpy(model.coef_),
            "intercept": float(model.intercept_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


class LassoRegressionNode(BaseNode):
    """
    Fits a lasso regression model (L1 regularization).
    machine learning, regression, regularization, feature selection

    Use cases:
    - Feature selection
    - Sparse solutions
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")

    y_train: NPArray = Field(default=NPArray(), description="Training target values")

    alpha: float = Field(default=1.0, description="Regularization strength")

    @classmethod
    def return_type(cls):
        return {
            "coefficients": NPArray,
            "intercept": float,
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = Lasso(alpha=self.alpha)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())

        return {
            "coefficients": NPArray.from_numpy(model.coef_),
            "intercept": float(model.intercept_),
            "model": SKLearnModel(model=pickle.dumps(model)),
        }


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
        model = pickle.loads(self.model.model)
        predictions = model.predict(self.X.to_numpy())

        return NPArray.from_numpy(predictions)
