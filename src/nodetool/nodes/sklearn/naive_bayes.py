from typing import Optional
from pydantic import Field
import pickle
from sklearn.naive_bayes import GaussianNB, MultinomialNB, BernoulliNB
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class GaussianNBNode(BaseNode):
    """
    Gaussian Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Real-valued feature classification
    - Fast training and prediction
    - Baseline for classification tasks
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    var_smoothing: float = Field(
        default=1e-9,
        description="Portion of the largest variance of all features that is added to variances for calculation stability",
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = GaussianNB(var_smoothing=self.var_smoothing)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class MultinomialNBNode(BaseNode):
    """
    Multinomial Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Text classification
    - Document categorization
    - Feature counts or frequencies
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    alpha: float = Field(
        default=1.0,
        description="Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing)",
    )
    fit_prior: bool = Field(
        default=True, description="Whether to learn class prior probabilities"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = MultinomialNB(alpha=self.alpha, fit_prior=self.fit_prior)
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}


class BernoulliNBNode(BaseNode):
    """
    Bernoulli Naive Bayes classifier.
    machine learning, classification, naive bayes, probabilistic

    Use cases:
    - Text classification with binary features
    - Document classification
    - Binary feature classification
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    alpha: float = Field(
        default=1.0,
        description="Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing)",
    )
    fit_prior: bool = Field(
        default=True, description="Whether to learn class prior probabilities"
    )
    binarize: Optional[float] = Field(
        default=0.0,
        description="Threshold for binarizing features (None for no binarization)",
    )

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
        }

    async def process(self, context: ProcessingContext) -> dict:
        model = BernoulliNB(
            alpha=self.alpha,
            fit_prior=self.fit_prior,
            binarize=self.binarize,
        )
        model.fit(self.X_train.to_numpy(), self.y_train.to_numpy())
        return {"model": SKLearnModel(model=pickle.dumps(model))}
