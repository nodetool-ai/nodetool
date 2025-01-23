import enum
from sklearn.inspection import DecisionBoundaryDisplay
from io import BytesIO
from PIL import Image
import matplotlib.pyplot as plt
from typing import Optional, List, Union
from pydantic import Field
import pickle
import numpy as np
from sklearn.inspection import PartialDependenceDisplay
from io import BytesIO
from PIL import Image
from sklearn.inspection import partial_dependence, permutation_importance
from sklearn.utils import Bunch
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, NPArray, SKLearnModel


class PartialDependenceKind(str, enum.Enum):
    AVERAGE = "average"
    INDIVIDUAL = "individual"


class PartialDependenceNode(BaseNode):
    """
    Calculate Partial Dependence for features.
    machine learning, model inspection, feature effects

    Use cases:
    - Feature impact visualization
    - Model interpretation
    - Understanding feature relationships
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Fitted sklearn model"
    )
    X: NPArray = Field(default=NPArray(), description="Training data")
    features: tuple[int] = Field(
        description="List of features for which to calculate PD. Each element can be an int for 1D PD or a list of 2 ints for 2D"
    )
    kind: PartialDependenceKind = Field(
        default=PartialDependenceKind.AVERAGE,
        description="Kind of partial dependence result: 'average' or 'individual'",
    )
    grid_resolution: int = Field(
        default=100,
        description="Number of equally spaced points in the grid",
    )

    @classmethod
    def return_type(cls):
        return {
            "pd_values": List[NPArray],
            "pd_positions": List[NPArray],
        }

    async def process(self, context: ProcessingContext) -> dict:
        if self.model.model is None:
            raise ValueError("Model is not set")

        fitted_model = pickle.loads(self.model.model)

        results = partial_dependence(
            fitted_model,
            X=self.X.to_numpy(),
            features=self.features,
            kind=self.kind.value,
            grid_resolution=self.grid_resolution,
        )

        pd_values = [NPArray.from_numpy(arr) for arr in results[1]]
        pd_positions = [NPArray.from_numpy(arr) for arr in results[0]]

        return {
            "pd_values": pd_values,
            "pd_positions": pd_positions,
        }


class PermutationImportanceNode(BaseNode):
    """
    Calculate Permutation Feature Importance.
    machine learning, model inspection, feature importance

    Use cases:
    - Feature selection
    - Model interpretation
    - Identifying key predictors
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Fitted sklearn model"
    )
    X: NPArray = Field(default=NPArray(), description="Validation data")
    y: NPArray = Field(default=NPArray(), description="True labels/values")
    n_repeats: int = Field(
        default=5,
        description="Number of times to permute each feature",
    )
    random_state: Optional[int] = Field(
        default=None,
        description="Random state for reproducibility",
    )
    scoring: Optional[str] = Field(
        default=None,
        description="Scoring metric (if None, uses estimator's default scorer)",
    )
    n_jobs: Optional[int] = Field(
        default=None,
        description="Number of jobs to run in parallel",
    )

    @classmethod
    def return_type(cls):
        return {
            "importances_mean": NPArray,
            "importances_std": NPArray,
            "importances": NPArray,
        }

    async def process(self, context: ProcessingContext) -> dict:
        if self.model.model is None:
            raise ValueError("Model is not set")

        fitted_model = pickle.loads(self.model.model)

        results: Bunch = permutation_importance(
            fitted_model,
            self.X.to_numpy(),
            self.y.to_numpy(),
            n_repeats=self.n_repeats,
            random_state=self.random_state,
            scoring=self.scoring,
            n_jobs=self.n_jobs,
        )  # type: ignore

        return {
            "importances_mean": NPArray.from_numpy(results.importances_mean),
            "importances_std": NPArray.from_numpy(results.importances_std),
            "importances": NPArray.from_numpy(results.importances),
        }


# class DecisionBoundaryDisplayNode(BaseNode):
#     """
#     Visualize decision boundaries of a classifier.
#     machine learning, model inspection, visualization

#     Use cases:
#     - Visualizing classifier decision regions
#     - Model behavior analysis
#     - Understanding class boundaries
#     """

#     model: SKLearnModel = Field(
#         default=SKLearnModel(), description="Fitted sklearn classifier"
#     )
#     X: NPArray = Field(default=NPArray(), description="Training data")
#     grid_resolution: int = Field(
#         default=100,
#         description="Number of points to create for each feature dimension",
#     )
#     eps: float = Field(
#         default=1.0,
#         description="Extends the range of the plots to eps * (x.max() - x.min())",
#     )
#     feature_index_x: int = Field(
#         default=0, description="The index of the first feature"
#     )
#     feature_index_y: int = Field(
#         default=1, description="The index of the second feature"
#     )

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self.model.model is None:
#             raise ValueError("Model is not set")

#         fitted_model = pickle.loads(self.model.model)
#         X = self.X.to_numpy()

#         display = DecisionBoundaryDisplay.from_estimator(
#             fitted_model,
#             X[:, [self.feature_index_x, self.feature_index_y]],
#             grid_resolution=self.grid_resolution,
#             eps=self.eps,
#         )

#         fig, ax = plt.subplots()
#         display.plot(ax=ax)

#         buf = BytesIO()
#         fig.savefig(buf, format="png", bbox_inches="tight")
#         buf.seek(0)
#         pil_image = Image.open(buf)

#         plt.close(fig)
#         return await context.image_from_pil(pil_image)


class PartialDependenceDisplayNode(BaseNode):
    """
    Create Partial Dependence Plot (PDP) visualization data.
    machine learning, model inspection, visualization

    Use cases:
    - Visualizing feature effects
    - Model interpretation
    - Feature relationship analysis
    """

    model: SKLearnModel = Field(
        default=SKLearnModel(), description="Fitted sklearn model"
    )
    X: NPArray = Field(default=NPArray(), description="Training data")
    features: tuple[Union[int, tuple[int, int]]] = Field(
        description="Features for which to create PDP. Can be indices for 1D or tuples for 2D"
    )
    feature_names: str = Field(
        default="",
        description="Comma separated names of features",
    )
    grid_resolution: int = Field(
        default=100,
        description="Number of points in the grid",
    )
    lower_percentile: float = Field(
        default=0.05,
        description="Lower percentile to compute the feature values range",
    )
    upper_percentile: float = Field(
        default=0.95,
        description="Upper percentile to compute the feature values range",
    )
    kind: PartialDependenceKind = Field(
        default=PartialDependenceKind.AVERAGE,
        description="Kind of partial dependence result",
    )

    @classmethod
    def return_type(cls):
        return {
            "pd_results": List[tuple[NPArray, NPArray]],
            "feature_names": Optional[List[str]],
        }

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.model.model is None:
            raise ValueError("Model is not set")

        fitted_model = pickle.loads(self.model.model)

        fig, ax = plt.subplots()
        display = PartialDependenceDisplay.from_estimator(
            fitted_model,
            self.X.to_numpy(),
            self.features,
            feature_names=self.feature_names.split(",") if self.feature_names else None,
            grid_resolution=self.grid_resolution,
            percentiles=(self.lower_percentile, self.upper_percentile),
            kind=self.kind.value,
        )
        display.plot(ax=ax)

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        pil_image = Image.open(buf)

        plt.close(fig)
        return await context.image_from_pil(pil_image)
