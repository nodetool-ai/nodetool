import pickle
import numpy as np
import statsmodels.api as sm
from pydantic import Field
from nodetool.metadata.types import NPArray, StatsModelsModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum
from statsmodels.robust import norms


class MEstimator(Enum):
    HUBER = "huber"
    LEAST_SQUARES = "least_squares"
    ANDREW_WAVE = "andrew_wave"
    HAMPEL = "hampel"
    TRIMMED_MEAN = "trimmed_mean"
    TUKEY_BIWEIGHT = "tukey_biweight"


def get_m_estimator(m_estimator: MEstimator):
    if m_estimator == MEstimator.HUBER:
        return norms.HuberT()
    elif m_estimator == MEstimator.ANDREW_WAVE:
        return norms.AndrewWave()
    elif m_estimator == MEstimator.HAMPEL:
        return norms.Hampel()
    elif m_estimator == MEstimator.TRIMMED_MEAN:
        return norms.TrimmedMean()
    elif m_estimator == MEstimator.TUKEY_BIWEIGHT:
        return norms.TukeyBiweight()
    elif m_estimator == MEstimator.LEAST_SQUARES:
        return norms.LeastSquares()
    else:
        raise ValueError(f"Invalid M-estimator: {m_estimator}")


class RLMNode(BaseNode):
    """
    Robust Linear Model Regression.
    statistics, regression, robust, outliers

    Use cases:
    - Regression with outliers
    - Robust parameter estimation
    - Non-normal error distributions
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Target/dependent variable")
    M: MEstimator = Field(
        default=MEstimator.HUBER, description="M-estimator ('huber', 'bisquare', etc.)"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "rsquared": float,
        }

    async def process(self, context: ProcessingContext) -> dict:
        # Add constant term
        X = sm.add_constant(self.X.to_numpy())

        model = sm.RLM(self.y.to_numpy(), X, M=get_m_estimator(self.M))
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "rsquared": float(results.rsquared),
        }
