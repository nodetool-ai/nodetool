import pickle
from typing import Optional, List, Tuple
from pydantic import Field
import numpy as np
import matplotlib.pyplot as plt
from io import BytesIO
from PIL import Image
import seaborn as sns
from sklearn.manifold import TSNE
from sklearn.metrics import (
    roc_curve,
    auc,
    confusion_matrix,
)
from sklearn.model_selection import learning_curve, validation_curve
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, SKLearnModel, ImageRef


class ROCCurveNode(BaseNode):
    """
    Plot Receiver Operating Characteristic (ROC) curve.
    machine learning, visualization, evaluation, classification

    Use cases:
    - Binary classifier evaluation
    - Model comparison
    - Threshold selection
    """

    y_true: NPArray = Field(default=NPArray(), description="True binary labels")
    y_score: NPArray = Field(
        default=NPArray(), description="Target scores/probabilities"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.y_true.is_set() and self.y_score.is_set():
            y_true = self.y_true.to_numpy()
            y_score = self.y_score.to_numpy()
        else:
            raise ValueError("y_true or y_score is not set")

        fpr, tpr, _ = roc_curve(y_true, y_score)
        roc_auc = auc(fpr, tpr)

        fig, ax = plt.subplots()
        ax.plot(fpr, tpr, label=f"ROC curve (AUC = {roc_auc:.2f})")
        ax.plot([0, 1], [0, 1], "k--")
        ax.set_xlim([0.0, 1.0])  # type: ignore
        ax.set_ylim([0.0, 1.05])  # type: ignore
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title("Receiver Operating Characteristic (ROC) Curve")
        ax.legend(loc="lower right")

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class ConfusionMatrixPlotNode(BaseNode):
    """
    Plot confusion matrix heatmap.
    machine learning, visualization, evaluation, classification

    Use cases:
    - Classification error analysis
    - Model performance visualization
    - Class balance assessment
    """

    y_true: NPArray = Field(default=NPArray(), description="True labels")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted labels")
    normalize: bool = Field(
        default=True, description="Whether to normalize the confusion matrix"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.y_true.is_set() and self.y_pred.is_set():
            y_true = self.y_true.to_numpy()
            y_pred = self.y_pred.to_numpy()
        else:
            raise ValueError("y_true or y_pred is not set")

        cm = confusion_matrix(
            y_true,
            y_pred,
            normalize="true" if self.normalize else None,
        )

        fig, ax = plt.subplots(figsize=(8, 6))
        sns.heatmap(
            cm, annot=True, fmt=".2f" if self.normalize else "d", cmap="Blues", ax=ax
        )
        ax.set_xlabel("Predicted label")
        ax.set_ylabel("True label")
        ax.set_title("Confusion Matrix")

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class LearningCurveNode(BaseNode):
    """
    Plot learning curves to diagnose bias/variance.
    machine learning, visualization, evaluation, model selection

    Use cases:
    - Bias-variance diagnosis
    - Sample size impact analysis
    - Model complexity assessment
    """

    model: SKLearnModel = Field(description="Fitted sklearn model")
    X: NPArray = Field(default=NPArray(), description="Training features")
    y: NPArray = Field(default=NPArray(), description="Training labels")
    cv: int = Field(default=5, description="Number of cross-validation folds")
    n_jobs: int = Field(
        default=None, description="Number of jobs for parallel processing"
    )
    train_sizes: List[float] = Field(
        default=[0.1, 0.3, 0.5, 0.7, 0.9],
        description="Points on the training learning curve",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.model.model is None:
            raise ValueError("Model is not set")
        estimator = pickle.loads(self.model.model)

        if self.X.is_set() and self.y.is_set():
            X_data = self.X.to_numpy()
            y_data = self.y.to_numpy()
        else:
            raise ValueError("X or y is not set")

        train_sizes, train_scores, val_scores = learning_curve(  # type: ignore
            estimator,
            self.X.to_numpy(),
            self.y.to_numpy(),
            cv=self.cv,
            n_jobs=self.n_jobs,
            train_sizes=self.train_sizes,
            return_times=False,
        )

        train_mean = np.mean(train_scores, axis=1)
        train_std = np.std(train_scores, axis=1)
        val_mean = np.mean(val_scores, axis=1)
        val_std = np.std(val_scores, axis=1)

        fig, ax = plt.subplots()
        ax.plot(train_sizes, train_mean, label="Training score")
        ax.fill_between(
            train_sizes, train_mean - train_std, train_mean + train_std, alpha=0.1
        )
        ax.plot(train_sizes, val_mean, label="Cross-validation score")
        ax.fill_between(train_sizes, val_mean - val_std, val_mean + val_std, alpha=0.1)
        ax.set_xlabel("Training examples")
        ax.set_ylabel("Score")
        ax.set_title("Learning Curves")
        ax.legend(loc="best")
        ax.grid(True)

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class ClusterVisualizationNode(BaseNode):
    """
    Visualize clustering results in 2D space.
    machine learning, visualization, clustering

    Use cases:
    - Cluster analysis
    - Pattern recognition
    - Data distribution visualization
    """

    X: NPArray = Field(default=NPArray(), description="Input features (2D data)")
    labels: NPArray = Field(default=NPArray(), description="Cluster labels")
    centers: NPArray = Field(
        default=NPArray(), description="Cluster centers (if available)"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.X.is_set():
            X_data = self.X.to_numpy()
        else:
            raise ValueError("X is not set")

        if X_data.shape[1] != 2:
            raise ValueError("Input features must be 2-dimensional for visualization")

        fig, ax = plt.subplots(figsize=(10, 8))
        scatter = ax.scatter(
            X_data[:, 0], X_data[:, 1], c=self.labels.to_numpy(), cmap="viridis"
        )

        if self.centers.is_set():
            centers = self.centers.to_numpy()
            ax.scatter(
                centers[:, 0],
                centers[:, 1],
                c="red",
                marker="x",
                s=200,
                linewidths=3,
                label="Centroids",
            )
            ax.legend()

        ax.set_title("Clustering Results")
        ax.set_xlabel("Feature 1")
        ax.set_ylabel("Feature 2")
        plt.colorbar(scatter, label="Cluster")

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class ElbowCurvePlotNode(BaseNode):
    """
    Plot elbow curve for K-means clustering.
    machine learning, visualization, clustering, model selection

    Use cases:
    - Optimal cluster number selection
    - K-means evaluation
    - Model complexity analysis
    """

    inertias: NPArray = Field(
        default=NPArray(), description="Inertia values for different k"
    )
    k_values: NPArray = Field(default=NPArray(), description="K values tested")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.inertias.is_set() and self.k_values.is_set():
            inertias = self.inertias.to_numpy()
            k_values = self.k_values.to_numpy()
        else:
            raise ValueError("inertias or k_values is not set")

        fig, ax = plt.subplots(figsize=(10, 6))
        ax.plot(k_values, inertias, "bo-")
        ax.set_xlabel("Number of Clusters (k)")
        ax.set_ylabel("Inertia")
        ax.set_title("Elbow Curve")
        ax.grid(True)

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class RegressionPredictionPlotNode(BaseNode):
    """
    Plot actual vs predicted values for regression models.
    machine learning, visualization, evaluation, regression

    Use cases:
    - Regression model evaluation
    - Prediction accuracy visualization
    - Outlier detection
    """

    y_true: NPArray = Field(default=NPArray(), description="True values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.y_true.is_set() and self.y_pred.is_set():
            y_true = self.y_true.to_numpy()
            y_pred = self.y_pred.to_numpy()
        else:
            raise ValueError("y_true or y_pred is not set")

        fig, ax = plt.subplots(figsize=(8, 8))

        # Plot the scatter of actual vs predicted
        ax.scatter(self.y_true.to_numpy(), self.y_pred.to_numpy(), alpha=0.5)

        # Plot the perfect prediction line
        min_val = min(self.y_true.to_numpy().min(), self.y_pred.to_numpy().min())
        max_val = max(self.y_true.to_numpy().max(), self.y_pred.to_numpy().max())
        ax.plot(
            [min_val, max_val], [min_val, max_val], "r--", label="Perfect Prediction"
        )

        ax.set_xlabel("Actual Values")
        ax.set_ylabel("Predicted Values")
        ax.set_title("Actual vs Predicted Values")
        ax.legend()
        ax.grid(True)

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class RegressionResidualPlotNode(BaseNode):
    """
    Plot residuals for regression analysis.
    machine learning, visualization, evaluation, regression

    Use cases:
    - Model assumptions validation
    - Error pattern detection
    - Heteroscedasticity check
    """

    y_true: NPArray = Field(default=NPArray(), description="True values")
    y_pred: NPArray = Field(default=NPArray(), description="Predicted values")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.y_true.is_set() and self.y_pred.is_set():
            residuals = self.y_true.to_numpy() - self.y_pred.to_numpy()
        else:
            raise ValueError("y_true or y_pred is not set")

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

        # Residuals vs Predicted
        ax1.scatter(self.y_pred.to_numpy(), residuals, alpha=0.5)
        ax1.axhline(y=0, color="r", linestyle="--")
        ax1.set_xlabel("Predicted Values")
        ax1.set_ylabel("Residuals")
        ax1.set_title("Residuals vs Predicted Values")
        ax1.grid(True)

        # Residual distribution
        ax2.hist(residuals, bins=30, edgecolor="black")
        ax2.set_xlabel("Residual Value")
        ax2.set_ylabel("Frequency")
        ax2.set_title("Residual Distribution")
        ax2.grid(True)

        plt.tight_layout()

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class DecisionBoundaryPlot(BaseNode):
    """
    Visualize classifier decision boundaries in 2D space.
    machine learning, visualization, classification, knn

    Use cases:
    - Decision boundary visualization
    - Model behavior analysis
    - Feature space understanding
    - High-dimensional data visualization through dimension selection
    """

    model: SKLearnModel = Field(default=SKLearnModel(), description="Fitted classifier")
    X: NPArray = Field(default=NPArray(), description="Training features")
    y: NPArray = Field(default=NPArray(), description="Training labels")
    mesh_step_size: float = Field(
        default=0.02,
        description="Step size for creating the mesh grid",
    )
    dim1: int = Field(
        default=0,
        description="First dimension index to plot",
    )
    dim2: int = Field(
        default=1,
        description="Second dimension index to plot",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.model.model is None:
            raise ValueError("Model is not set")
        if self.y.is_empty():
            raise ValueError("y is not set")

        if self.X.is_set():
            X_data = self.X.to_numpy()
        else:
            raise ValueError("X is not set")

        if X_data.shape[1] < 2:
            raise ValueError("Input features must have at least 2 dimensions")

        if max(self.dim1, self.dim2) >= X_data.shape[1]:
            raise ValueError(
                f"Selected dimensions ({self.dim1}, {self.dim2}) out of range. "
                f"Data has {X_data.shape[1]} dimensions"
            )

        # Select the two dimensions for visualization
        X_plot = X_data[:, [self.dim1, self.dim2]]

        if self.model.model is None:
            raise ValueError("Model is not set")

        classifier = pickle.loads(self.model.model)

        # Create mesh grid
        x_min, x_max = X_plot[:, 0].min() - 1, X_plot[:, 0].max() + 1
        y_min, y_max = X_plot[:, 1].min() - 1, X_plot[:, 1].max() + 1
        xx, yy = np.meshgrid(
            np.arange(x_min, x_max, self.mesh_step_size),
            np.arange(y_min, y_max, self.mesh_step_size),
        )

        # For high-dimensional data, we need to create a full feature vector
        # with zeros for non-plotted dimensions
        if X_data.shape[1] > 2:
            mesh_points = np.zeros((xx.ravel().shape[0], X_data.shape[1]))
            mesh_points[:, self.dim1] = xx.ravel()
            mesh_points[:, self.dim2] = yy.ravel()
            Z = classifier.predict(mesh_points)
        else:
            Z = classifier.predict(np.c_[xx.ravel(), yy.ravel()])

        Z = Z.reshape(xx.shape)

        # Plot decision boundary and points
        fig, ax = plt.subplots(figsize=(10, 8))
        ax.contourf(xx, yy, Z, alpha=0.4, cmap="viridis")
        scatter = ax.scatter(
            X_plot[:, 0],
            X_plot[:, 1],
            c=self.y.to_numpy(),
            cmap="viridis",
            edgecolors="black",
        )

        ax.set_xlabel(f"Feature {self.dim1}")
        ax.set_ylabel(f"Feature {self.dim2}")
        ax.set_title("Decision Boundary")
        plt.colorbar(scatter, label="Class")

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))


class PlotTSNE(BaseNode):
    """
    Create a t-SNE plot for high-dimensional array data.
    array, tsne, visualization, dimensionality reduction

    Use cases:
    - Visualize clusters in high-dimensional data
    - Explore relationships in complex datasets
    - Reduce dimensionality for data analysis
    """

    array: NPArray = NPArray()
    color_indices: list[int] = []
    perplexity: int = Field(title="Perplexity", default=30, ge=1, le=50)

    async def process(self, context: ProcessingContext) -> ImageRef:
        sns.set_theme(style="darkgrid")
        matrix = self.array.to_numpy()
        print("matrix shape", matrix.shape)
        tsne = TSNE(
            n_components=2,
            perplexity=self.perplexity,
            random_state=42,
            init="random",
            learning_rate=200,
        )
        vis_dims = tsne.fit_transform(matrix)
        (fig, ax) = plt.subplots()
        data = {"x": [x for (x, y) in vis_dims], "y": [y for (x, y) in vis_dims]}
        sns.scatterplot(
            data=data,
            x="x",
            y="y",
            hue=self.color_indices,
            palette="viridis",
            alpha=0.3,
            ax=ax,
        )
        img_bytes = BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class NMFComponentsPlotNode(BaseNode):
    """
    Visualize NMF components as a heatmap.
    machine learning, visualization, dimensionality reduction, nmf

    Use cases:
    - Inspect learned NMF components
    - Analyze feature patterns
    - Validate decomposition results
    """

    components: NPArray = Field(
        default=NPArray(),
        description="NMF components matrix (from components_ attribute)",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        components_data = self.components.to_numpy()

        fig, ax = plt.subplots(figsize=(12, 8))
        sns.heatmap(
            components_data,
            cmap="YlOrRd",
            ax=ax,
            xticklabels=[f"Feature {i+1}" for i in range(components_data.shape[1])],
            yticklabels=[f"Component {i+1}" for i in range(components_data.shape[0])],
        )

        ax.set_xlabel("Features")
        ax.set_ylabel("NMF Components")
        ax.set_title("NMF Components Heatmap")

        buf = BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)

        return await context.image_from_pil(Image.open(buf))
