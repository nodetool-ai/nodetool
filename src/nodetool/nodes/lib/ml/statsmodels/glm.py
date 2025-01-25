from enum import Enum
from typing import Optional, List
from pydantic import Field
import pickle
import numpy as np
import statsmodels.api as sm
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel


class GLMFamily(str, Enum):
    GAUSSIAN = "gaussian"
    BINOMIAL = "binomial"
    POISSON = "poisson"
    GAMMA = "gamma"
    INVERSE_GAUSSIAN = "inverse_gaussian"


class GLMLink(str, Enum):
    IDENTITY = "identity"
    LOG = "log"
    LOGIT = "logit"
    PROBIT = "probit"
    SQRT = "sqrt"


class GLMNode(BaseNode):
    """
    Generalized Linear Models using statsmodels.
    machine learning, regression, generalized linear models

    Use cases:
    - Various types of regression (linear, logistic, poisson, etc.)
    - Handling non-normal error distributions
    - Complex regression analysis
    """

    X_train: NPArray = Field(default=NPArray(), description="Training features")
    y_train: NPArray = Field(default=NPArray(), description="Training target values")
    family: GLMFamily = Field(
        default=GLMFamily.GAUSSIAN, description="Error distribution family"
    )
    link: Optional[GLMLink] = Field(
        default=None, description="Link function (if None, uses canonical link)"
    )
    alpha: float = Field(default=0.0, description="L2 regularization parameter")
    max_iter: int = Field(default=100, description="Maximum number of iterations")

    @classmethod
    def return_type(cls):
        return {
            "model": SKLearnModel,
            "params": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        # Get family object
        family_map = {
            GLMFamily.GAUSSIAN: sm.families.Gaussian,
            GLMFamily.BINOMIAL: sm.families.Binomial,
            GLMFamily.POISSON: sm.families.Poisson,
            GLMFamily.GAMMA: sm.families.Gamma,
            GLMFamily.INVERSE_GAUSSIAN: sm.families.InverseGaussian,
        }

        # Get link function if specified
        link_map = {
            GLMLink.IDENTITY: sm.families.links.Identity,
            GLMLink.LOG: sm.families.links.Log,
            GLMLink.LOGIT: sm.families.links.Logit,
            GLMLink.PROBIT: sm.families.links.Probit,
            GLMLink.SQRT: sm.families.links.Sqrt,
        }

        family_class = family_map[self.family]
        if self.link:
            link_class = link_map[self.link]
            family = family_class(link=link_class())
        else:
            family = family_class()

        # Add constant term to X
        X = sm.add_constant(self.X_train.to_numpy())
        y = self.y_train.to_numpy()

        # Fit model
        model = sm.GLM(y, X, family=family)
        results = model.fit_regularized(alpha=self.alpha, maxiter=self.max_iter)

        return {
            "model": SKLearnModel(model=pickle.dumps(results)),
            "params": NPArray.from_numpy(results.params),
        }


class GLMPredictNode(BaseNode):
    """
    Make predictions using a fitted GLM model.
    machine learning, regression, prediction, generalized linear models

    Use cases:
    - Prediction with GLM models
    - Out-of-sample prediction
    - Model evaluation
    """

    model: SKLearnModel = Field(default=SKLearnModel(), description="Fitted GLM model")
    X: NPArray = Field(default=NPArray(), description="Features to predict on")

    @classmethod
    def return_type(cls):
        return {
            "predictions": NPArray,
            "standard_errors": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        assert self.model.model is not None, "Model is not set"

        results = pickle.loads(self.model.model)

        # Add constant term to X
        X = sm.add_constant(self.X.to_numpy())

        # Get predictions and standard errors
        predictions = results.predict(X)
        standard_errors = results.get_prediction(X).se_mean

        return {
            "predictions": NPArray.from_numpy(predictions),
            "standard_errors": NPArray.from_numpy(standard_errors),
        }
