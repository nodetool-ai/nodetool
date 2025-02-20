from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ClusterVisualizationNode(GraphNode):
    """
    Visualize clustering results in 2D space.
    machine learning, visualization, clustering

    Use cases:
    - Cluster analysis
    - Pattern recognition
    - Data distribution visualization
    """

    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input features (2D data)')
    labels: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Cluster labels')
    centers: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Cluster centers (if available)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.ClusterVisualization"



class ConfusionMatrixPlotNode(GraphNode):
    """
    Plot confusion matrix heatmap.
    machine learning, visualization, evaluation, classification

    Use cases:
    - Classification error analysis
    - Model performance visualization
    - Class balance assessment
    """

    y_true: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='True labels')
    y_pred: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Predicted labels')
    normalize: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to normalize the confusion matrix')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.ConfusionMatrixPlot"



class DecisionBoundaryPlot(GraphNode):
    """
    Visualize classifier decision boundaries in 2D space.
    machine learning, visualization, classification, knn

    Use cases:
    - Decision boundary visualization
    - Model behavior analysis
    - Feature space understanding
    - High-dimensional data visualization through dimension selection
    """

    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=SKLearnModel(type='sklearn_model', model=None), description='Fitted classifier')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training labels')
    mesh_step_size: float | GraphNode | tuple[GraphNode, str] = Field(default=0.02, description='Step size for creating the mesh grid')
    dim1: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First dimension index to plot')
    dim2: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Second dimension index to plot')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.DecisionBoundaryPlot"



class ElbowCurvePlotNode(GraphNode):
    """
    Plot elbow curve for K-means clustering.
    machine learning, visualization, clustering, model selection

    Use cases:
    - Optimal cluster number selection
    - K-means evaluation
    - Model complexity analysis
    """

    inertias: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Inertia values for different k')
    k_values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='K values tested')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.ElbowCurvePlot"



class LearningCurveNode(GraphNode):
    """
    Plot learning curves to diagnose bias/variance.
    machine learning, visualization, evaluation, model selection

    Use cases:
    - Bias-variance diagnosis
    - Sample size impact analysis
    - Model complexity assessment
    """

    model: SKLearnModel | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Fitted sklearn model')
    X: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training features')
    y: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Training labels')
    cv: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of cross-validation folds')
    n_jobs: int | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Number of jobs for parallel processing')
    train_sizes: List | GraphNode | tuple[GraphNode, str] = Field(default=[0.1, 0.3, 0.5, 0.7, 0.9], description='Points on the training learning curve')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.LearningCurve"



class NMFComponentsPlotNode(GraphNode):
    """
    Visualize NMF components as a heatmap.
    machine learning, visualization, dimensionality reduction, nmf

    Use cases:
    - Inspect learned NMF components
    - Analyze feature patterns
    - Validate decomposition results
    """

    components: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='NMF components matrix (from components_ attribute)')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.NMFComponentsPlot"



class PlotTSNE(GraphNode):
    """
    Create a t-SNE plot for high-dimensional array data.
    array, tsne, visualization, dimensionality reduction

    Use cases:
    - Visualize clusters in high-dimensional data
    - Explore relationships in complex datasets
    - Reduce dimensionality for data analysis
    """

    array: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description=None)
    color_indices: list[int] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    perplexity: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.PlotTSNE"



class ROCCurveNode(GraphNode):
    """
    Plot Receiver Operating Characteristic (ROC) curve.
    machine learning, visualization, evaluation, classification

    Use cases:
    - Binary classifier evaluation
    - Model comparison
    - Threshold selection
    """

    y_true: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='True binary labels')
    y_score: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Target scores/probabilities')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.ROCCurve"



class RegressionPredictionPlotNode(GraphNode):
    """
    Plot actual vs predicted values for regression models.
    machine learning, visualization, evaluation, regression

    Use cases:
    - Regression model evaluation
    - Prediction accuracy visualization
    - Outlier detection
    """

    y_true: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='True values')
    y_pred: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Predicted values')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.RegressionPredictionPlot"



class RegressionResidualPlotNode(GraphNode):
    """
    Plot residuals for regression analysis.
    machine learning, visualization, evaluation, regression

    Use cases:
    - Model assumptions validation
    - Error pattern detection
    - Heteroscedasticity check
    """

    y_true: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='True values')
    y_pred: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Predicted values')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.visualization.RegressionResidualPlot"


