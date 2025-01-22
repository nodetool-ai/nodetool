import enum
from typing import Optional, List
from pydantic import Field
import numpy as np
from sklearn import metrics
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray


class ClassificationMetricsAverage(str, enum.Enum):
    BINARY = "binary"
    MICRO = "micro"
    MACRO = "macro"
    WEIGHTED = "weighted"


class ROCCurveNode(BaseNode):
    """
    Calculate ROC curve and AUC score.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Binary classifier evaluation
    - Model comparison
    - Threshold selection
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_score: NPArray = Field(
        default=NPArray(), description="Predicted probabilities or scores"
    )

    @classmethod
    def return_type(cls):
        return {
            "fpr": NPArray,
            "tpr": NPArray,
            "thresholds": NPArray,
            "auc": float,
        }

    async def process(self, context: ProcessingContext) -> dict:
        y_true = self.y_true.to_numpy()
        y_score = self.y_score.to_numpy()

        fpr, tpr, thresholds = metrics.roc_curve(y_true, y_score)
        return {
            "fpr": NPArray.from_numpy(fpr),
            "tpr": NPArray.from_numpy(tpr),
            "thresholds": NPArray.from_numpy(thresholds),
            "auc": float(metrics.auc(fpr, tpr)),
        }


class AccuracyNode(BaseNode):
    """
    Calculate accuracy score for classification.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Model evaluation
    - Classification accuracy assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.accuracy_score(y_true, y_pred))


class PrecisionNode(BaseNode):
    """
    Calculate precision score for classification.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Model evaluation
    - Precision assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")
    average: ClassificationMetricsAverage = Field(
        default=ClassificationMetricsAverage.BINARY,
        description="Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted'",
    )

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(
            metrics.precision_score(y_true, y_pred, average=self.average.value)
        )


class MSENode(BaseNode):
    """
    Calculate Mean Squared Error for regression.
    machine learning, evaluation, metrics, regression

    Use cases:
    - Model evaluation
    - Regression error assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.mean_squared_error(y_true, y_pred))


class SilhouetteScoreNode(BaseNode):
    """
    Calculate Silhouette score for clustering.
    machine learning, evaluation, metrics, clustering

    Use cases:
    - Cluster quality assessment
    - Clustering algorithm evaluation
    """

    X: NPArray = Field(default=NPArray(), description="Input samples")
    labels: NPArray = Field(default=NPArray(), description="Cluster labels")

    async def process(self, context: ProcessingContext) -> float:
        X = self.X.to_numpy()
        labels = self.labels.to_numpy()
        return float(metrics.silhouette_score(X, labels))


class RecallNode(BaseNode):
    """
    Calculate recall score for classification.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Model evaluation
    - Recall assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")
    average: ClassificationMetricsAverage = Field(
        default=ClassificationMetricsAverage.BINARY,
        description="Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted'",
    )

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.recall_score(y_true, y_pred, average=self.average.value))


class F1Node(BaseNode):
    """
    Calculate F1 score for classification.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Model evaluation
    - Balance between precision and recall
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")
    average: ClassificationMetricsAverage = Field(
        default=ClassificationMetricsAverage.BINARY,
        description="Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted'",
    )

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.f1_score(y_true, y_pred, average=self.average.value))


class ConfusionMatrixNode(BaseNode):
    """
    Calculate confusion matrix for classification.
    machine learning, evaluation, metrics, classification

    Use cases:
    - Detailed classification error analysis
    - Model performance visualization
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")

    @classmethod
    def return_type(cls):
        return NPArray

    async def process(self, context: ProcessingContext) -> NPArray:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return NPArray.from_numpy(metrics.confusion_matrix(y_true, y_pred))


class RMSENode(BaseNode):
    """
    Calculate Root Mean Squared Error for regression.
    machine learning, evaluation, metrics, regression

    Use cases:
    - Model evaluation
    - Error magnitude assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        mse = metrics.mean_squared_error(y_true, y_pred)
        return float(np.sqrt(mse))


class MAENode(BaseNode):
    """
    Calculate Mean Absolute Error for regression.
    machine learning, evaluation, metrics, regression

    Use cases:
    - Model evaluation
    - Average error magnitude assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.mean_absolute_error(y_true, y_pred))


class R2Node(BaseNode):
    """
    Calculate R-squared (coefficient of determination) score for regression.
    machine learning, evaluation, metrics, regression

    Use cases:
    - Model fit assessment
    - Variance explanation evaluation
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.r2_score(y_true, y_pred))


class ExplainedVarianceNode(BaseNode):
    """
    Calculate explained variance score for regression.
    machine learning, evaluation, metrics, regression

    Use cases:
    - Model quality assessment
    - Variance explanation evaluation
    """

    y_true: NPArray = Field(default=NPArray(), description="Ground truth values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        y_true = self.y_true.to_numpy()
        y_pred = self.y_pred.to_numpy()
        return float(metrics.explained_variance_score(y_true, y_pred))


class CalinskiHarabaszNode(BaseNode):
    """
    Calculate Calinski-Harabasz score for clustering.
    machine learning, evaluation, metrics, clustering

    Use cases:
    - Cluster separation assessment
    - Optimal cluster number selection
    """

    X: NPArray = Field(default=NPArray(), description="Input samples")
    labels: NPArray = Field(default=NPArray(), description="Cluster labels")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        X = self.X.to_numpy()
        labels = self.labels.to_numpy()
        return float(metrics.calinski_harabasz_score(X, labels))


class DaviesBouldinNode(BaseNode):
    """
    Calculate Davies-Bouldin score for clustering.
    machine learning, evaluation, metrics, clustering

    Use cases:
    - Cluster quality assessment
    - Clustering algorithm comparison
    """

    X: NPArray = Field(default=NPArray(), description="Input samples")
    labels: NPArray = Field(default=NPArray(), description="Cluster labels")

    @classmethod
    def return_type(cls):
        return float

    async def process(self, context: ProcessingContext) -> float:
        X = self.X.to_numpy()
        labels = self.labels.to_numpy()
        return float(metrics.davies_bouldin_score(X, labels))
