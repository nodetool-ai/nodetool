from typing import Optional, List
from pydantic import Field
import pickle
import numpy as np
import statsmodels.api as sm
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, StatsModelsModel


class OLSNode(BaseNode):
    """
    Ordinary Least Squares Regression.
    statistics, regression, linear model

    Use cases:
    - Linear regression analysis
    - Statistical inference
    - Hypothesis testing
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Target/dependent variable")
    add_constant: bool = Field(
        default=True, description="Add a constant term to the model"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "rsquared": float,
            "rsquared_adj": float,
            "fvalue": float,
            "f_pvalue": float,
        }

    async def process(self, context: ProcessingContext) -> dict:
        X = self.X.to_numpy()
        if self.add_constant:
            X = sm.add_constant(X)

        model = sm.OLS(self.y.to_numpy(), X)
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "rsquared": float(results.rsquared),
            "rsquared_adj": float(results.rsquared_adj),
            "fvalue": float(results.fvalue),
            "f_pvalue": float(results.f_pvalue),
        }


class WLSNode(BaseNode):
    """
    Weighted Least Squares Regression.
    statistics, regression, linear model, weighted

    Use cases:
    - Heteroscedastic data
    - Varying observation reliability
    - Weighted regression analysis
    """

    X: NPArray = Field(default=NPArray(), description="Features/independent variables")
    y: NPArray = Field(default=NPArray(), description="Target/dependent variable")
    weights: float = Field(default=1.0, description="Weights for observations")
    add_constant: bool = Field(
        default=True, description="Add a constant term to the model"
    )

    @classmethod
    def return_type(cls):
        return {
            "model": StatsModelsModel,
            "summary": str,
            "params": NPArray,
            "rsquared": float,
            "rsquared_adj": float,
            "fvalue": float,
            "f_pvalue": float,
        }

    async def process(self, context: ProcessingContext) -> dict:
        X = self.X.to_numpy()
        if self.add_constant:
            X = sm.add_constant(X)

        model = sm.WLS(self.y.to_numpy(), X, weights=self.weights)
        results = model.fit()

        return {
            "model": StatsModelsModel(model=pickle.dumps(results)),
            "summary": str(results.summary()),
            "params": NPArray.from_numpy(results.params),
            "rsquared": float(results.rsquared),
            "rsquared_adj": float(results.rsquared_adj),
            "fvalue": float(results.fvalue),
            "f_pvalue": float(results.f_pvalue),
        }
