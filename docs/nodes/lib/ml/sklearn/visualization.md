# nodetool.nodes.lib.ml.sklearn.visualization

## ClusterVisualizationNode

Visualize clustering results in 2D space.

Use cases:
- Cluster analysis
- Pattern recognition
- Data distribution visualization

**Tags:** machine learning, visualization, clustering

**Fields:**
- **X**: Input features (2D data) (NPArray)
- **labels**: Cluster labels (NPArray)
- **centers**: Cluster centers (if available) (NPArray)


## ConfusionMatrixPlotNode

Plot confusion matrix heatmap.

Use cases:
- Classification error analysis
- Model performance visualization
- Class balance assessment

**Tags:** machine learning, visualization, evaluation, classification

**Fields:**
- **y_true**: True labels (NPArray)
- **y_pred**: Predicted labels (NPArray)
- **normalize**: Whether to normalize the confusion matrix (bool)


## DecisionBoundaryPlot

Visualize classifier decision boundaries in 2D space.

Use cases:
- Decision boundary visualization
- Model behavior analysis
- Feature space understanding
- High-dimensional data visualization through dimension selection

**Tags:** machine learning, visualization, classification, knn

**Fields:**
- **model**: Fitted classifier (SKLearnModel)
- **X**: Training features (NPArray)
- **y**: Training labels (NPArray)
- **mesh_step_size**: Step size for creating the mesh grid (float)
- **dim1**: First dimension index to plot (int)
- **dim2**: Second dimension index to plot (int)


## ElbowCurvePlotNode

Plot elbow curve for K-means clustering.

Use cases:
- Optimal cluster number selection
- K-means evaluation
- Model complexity analysis

**Tags:** machine learning, visualization, clustering, model selection

**Fields:**
- **inertias**: Inertia values for different k (NPArray)
- **k_values**: K values tested (NPArray)


## LearningCurveNode

Plot learning curves to diagnose bias/variance.

Use cases:
- Bias-variance diagnosis
- Sample size impact analysis
- Model complexity assessment

**Tags:** machine learning, visualization, evaluation, model selection

**Fields:**
- **model**: Fitted sklearn model (SKLearnModel)
- **X**: Training features (NPArray)
- **y**: Training labels (NPArray)
- **cv**: Number of cross-validation folds (int)
- **n_jobs**: Number of jobs for parallel processing (int)
- **train_sizes**: Points on the training learning curve (typing.List[float])


## NMFComponentsPlotNode

Visualize NMF components as a heatmap.

Use cases:
- Inspect learned NMF components
- Analyze feature patterns
- Validate decomposition results

**Tags:** machine learning, visualization, dimensionality reduction, nmf

**Fields:**
- **components**: NMF components matrix (from components_ attribute) (NPArray)


## PlotTSNE

Create a t-SNE plot for high-dimensional array data.

Use cases:
- Visualize clusters in high-dimensional data
- Explore relationships in complex datasets
- Reduce dimensionality for data analysis

**Tags:** array, tsne, visualization, dimensionality reduction

**Fields:**
- **array** (NPArray)
- **color_indices** (list[int])
- **perplexity** (int)


## ROCCurveNode

Plot Receiver Operating Characteristic (ROC) curve.

Use cases:
- Binary classifier evaluation
- Model comparison
- Threshold selection

**Tags:** machine learning, visualization, evaluation, classification

**Fields:**
- **y_true**: True binary labels (NPArray)
- **y_score**: Target scores/probabilities (NPArray)


## RegressionPredictionPlotNode

Plot actual vs predicted values for regression models.

Use cases:
- Regression model evaluation
- Prediction accuracy visualization
- Outlier detection

**Tags:** machine learning, visualization, evaluation, regression

**Fields:**
- **y_true**: True values (NPArray)
- **y_pred**: Predicted values (NPArray)


## RegressionResidualPlotNode

Plot residuals for regression analysis.

Use cases:
- Model assumptions validation
- Error pattern detection
- Heteroscedasticity check

**Tags:** machine learning, visualization, evaluation, regression

**Fields:**
- **y_true**: True values (NPArray)
- **y_pred**: Predicted values (NPArray)


