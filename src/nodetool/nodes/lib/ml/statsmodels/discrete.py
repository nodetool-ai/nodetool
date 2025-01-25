from typing import Optional
import statsmodels.api as sm
import pickle
from pydantic import Field

from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import NPArray, StatsModelsModel
from nodetool.workflows.processing_context import ProcessingContext


class LogitNode(BaseNode):
    """
    Logistic Regression using statsmodels.
    statistics, regression, classification, logistic

    Use cases:
    - Binary classification
    - Probability estimation
    - Statistical inference for classification
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Binary target variable (0/1)")

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "pvalues": NPArray,
            "pseudo_rsquared": float,
        }

    async def process(self, context: ProcessingContext) -> dict:
        # Add constant term
        X = sm.add_constant(self.X.to_numpy())

        model = sm.Logit(self.y.to_numpy(), X)
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "pvalues": NPArray.from_numpy(results.pvalues),
            "pseudo_rsquared": float(results.prsquared),
        }


class PoissonNode(BaseNode):
    """
    Poisson Regression for count data.
    statistics, regression, count-data, poisson

    Use cases:
    - Modeling count data
    - Rate data analysis
    - Event frequency prediction
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Count data target variable")
    exposure: Optional[NPArray] = Field(
        default=None, description="Optional exposure variable"
    )
    offset: Optional[NPArray] = Field(default=None, description="Optional offset term")

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "pvalues": NPArray,
            "predicted_counts": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        X = sm.add_constant(self.X.to_numpy())
        model = sm.Poisson(
            self.y.to_numpy(),
            X,
            exposure=self.exposure.to_numpy() if self.exposure else None,
            offset=self.offset.to_numpy() if self.offset else None,
        )
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "pvalues": NPArray.from_numpy(results.pvalues),
            "predicted_counts": NPArray.from_numpy(results.predict()),
        }


class NegativeBinomialNode(BaseNode):
    """
    Negative Binomial Regression for overdispersed count data.
    statistics, regression, count-data, negative-binomial

    Use cases:
    - Overdispersed count data
    - When variance exceeds mean
    - More flexible than Poisson
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Count data target variable")
    exposure: Optional[NPArray] = Field(
        default=None, description="Optional exposure variable"
    )
    offset: Optional[NPArray] = Field(default=None, description="Optional offset term")

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "pvalues": NPArray,
            "predicted_counts": NPArray,
            "alpha": float,  # dispersion parameter
        }

    async def process(self, context: ProcessingContext) -> dict:
        X = sm.add_constant(self.X.to_numpy())
        model = sm.NegativeBinomial(
            self.y.to_numpy(),
            X,
            exposure=self.exposure.to_numpy() if self.exposure else None,
            offset=self.offset.to_numpy() if self.offset else None,
        )
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "pvalues": NPArray.from_numpy(results.pvalues),
            "predicted_counts": NPArray.from_numpy(results.predict()),
            "alpha": float(results.alpha),
        }


class MultinomialLogitNode(BaseNode):
    """
    Multinomial Logistic Regression for nominal outcomes.
    statistics, regression, multinomial, classification

    Use cases:
    - Multiple category classification
    - Nominal categorical outcomes
    - Choice modeling
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Categorical target variable")

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "pvalues": NPArray,
            "predicted_probs": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        X = sm.add_constant(self.X.to_numpy())
        model = sm.MNLogit(self.y.to_numpy(), X)
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "pvalues": NPArray.from_numpy(results.pvalues),
            "predicted_probs": NPArray.from_numpy(results.predict()),
        }
