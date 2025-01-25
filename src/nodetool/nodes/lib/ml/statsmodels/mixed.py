from typing import Optional, List
from pydantic import Field
import pickle
import numpy as np
import statsmodels.api as sm
from statsmodels.regression.mixed_linear_model import MixedLM
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, StatsModelsModel
import scipy.stats as stats


class MixedLMNode(BaseNode):
    """
    Linear Mixed Effects Model.
    statistics, regression, mixed effects, hierarchical model

    Use cases:
    - Hierarchical/nested data
    - Repeated measures analysis
    - Longitudinal data analysis
    - Clustered data
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Target/dependent variable")
    groups: NPArray = Field(
        default=NPArray(), description="Group labels for random effects"
    )
    use_reml: bool = Field(default=True, description="Use REML estimation")
    maxiter: int = Field(default=50, description="Maximum number of iterations")

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "random_effects": dict,
            "aic": float,
            "bic": float,
            "llf": float,
            "fe_params": NPArray,
            "bse_fe": NPArray,
            "cov_re": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        # Add constant term to X if not already present
        X = sm.add_constant(self.X.to_numpy())

        # Fit the mixed linear model
        model = MixedLM(
            self.y.to_numpy(),
            X,
            groups=self.groups.to_numpy(),
        )

        results = model.fit(reml=self.use_reml, maxiter=self.maxiter)

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "random_effects": results.random_effects,
            "aic": float(results.aic),
            "bic": float(results.bic),
            "llf": float(results.llf),  # Log-likelihood
            "fe_params": NPArray.from_numpy(results.fe_params),
            "bse_fe": NPArray.from_numpy(results.bse_fe),
            "cov_re": NPArray.from_numpy(results.cov_re),
        }


class MixedLMPredictNode(BaseNode):
    """
    Make predictions using a fitted Mixed Linear Model.
    statistics, regression, prediction, mixed effects

    Use cases:
    - Prediction with mixed effects models
    - Out-of-sample prediction
    - Model evaluation
    """

    model: StatsModelsModel = Field(
        default=StatsModelsModel(), description="Fitted Mixed LM model"
    )
    X: NPArray = Field(default=NPArray(), description="Features for prediction")
    groups: NPArray = Field(
        default=NPArray(), description="Group labels for prediction"
    )
    confidence_level: float = Field(
        default=0.95,
        description="Confidence level for prediction intervals (between 0 and 1)",
    )

    @classmethod
    def return_type(cls):
        return {
            "predictions": NPArray,
            "standard_errors": NPArray,
            "conf_intervals_lower": NPArray,
            "conf_intervals_upper": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        if not self.model.model:
            raise ValueError("Model is not set")

        results = pickle.loads(self.model.model)

        # Add constant term to X if not already present
        X = sm.add_constant(self.X.to_numpy())

        # Get predictions and standard errors
        predictions = results.predict(exog=X, groups=self.groups.to_numpy())
        standard_errors = results.predict(
            exog=X, groups=self.groups.to_numpy(), pred_type="standard_error"
        )

        # Calculate confidence intervals
        alpha = 1 - self.confidence_level
        z_score = stats.norm.ppf(1 - alpha / 2)
        conf_intervals_lower = predictions - z_score * standard_errors
        conf_intervals_upper = predictions + z_score * standard_errors

        return {
            "predictions": NPArray.from_numpy(predictions),
            "standard_errors": NPArray.from_numpy(standard_errors),
            "conf_intervals_lower": NPArray.from_numpy(conf_intervals_lower),
            "conf_intervals_upper": NPArray.from_numpy(conf_intervals_upper),
        }
