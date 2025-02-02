# nodetool.nodes.lib.ml.sklearn.metrics

## AccuracyNode

Calculate accuracy score for classification.

Use cases:
- Model evaluation
- Classification accuracy assessment

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_pred**: Predicted labels (NPArray)


## CalinskiHarabaszNode

Calculate Calinski-Harabasz score for clustering.

Use cases:
- Cluster separation assessment
- Optimal cluster number selection

**Tags:** machine learning, evaluation, metrics, clustering

**Fields:**
- **X**: Input samples (NPArray)
- **labels**: Cluster labels (NPArray)


## ClassificationMetricsAverage

## ConfusionMatrixNode

Calculate confusion matrix for classification.

Use cases:
- Detailed classification error analysis
- Model performance visualization

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_pred**: Predicted labels (NPArray)


## DaviesBouldinNode

Calculate Davies-Bouldin score for clustering.

Use cases:
- Cluster quality assessment
- Clustering algorithm comparison

**Tags:** machine learning, evaluation, metrics, clustering

**Fields:**
- **X**: Input samples (NPArray)
- **labels**: Cluster labels (NPArray)


## ExplainedVarianceNode

Calculate explained variance score for regression.

Use cases:
- Model quality assessment
- Variance explanation evaluation

**Tags:** machine learning, evaluation, metrics, regression

**Fields:**
- **y_true**: Ground truth values (NPArray)
- **y_pred**: Predicted values (NPArray)


## F1Node

Calculate F1 score for classification.

Use cases:
- Model evaluation
- Balance between precision and recall

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_pred**: Predicted labels (NPArray)
- **average**: Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted' (ClassificationMetricsAverage)


## MAENode

Calculate Mean Absolute Error for regression.

Use cases:
- Model evaluation
- Average error magnitude assessment

**Tags:** machine learning, evaluation, metrics, regression

**Fields:**
- **y_true**: Ground truth values (NPArray)
- **y_pred**: Predicted values (NPArray)


## MSENode

Calculate Mean Squared Error for regression.

Use cases:
- Model evaluation
- Regression error assessment

**Tags:** machine learning, evaluation, metrics, regression

**Fields:**
- **y_true**: Ground truth values (NPArray)
- **y_pred**: Predicted values (NPArray)


## PrecisionNode

Calculate precision score for classification.

Use cases:
- Model evaluation
- Precision assessment

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_pred**: Predicted labels (NPArray)
- **average**: Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted' (ClassificationMetricsAverage)


## R2Node

Calculate R-squared (coefficient of determination) score for regression.

Use cases:
- Model fit assessment
- Variance explanation evaluation

**Tags:** machine learning, evaluation, metrics, regression

**Fields:**
- **y_true**: Ground truth values (NPArray)
- **y_pred**: Predicted values (NPArray)


## RMSENode

Calculate Root Mean Squared Error for regression.

Use cases:
- Model evaluation
- Error magnitude assessment

**Tags:** machine learning, evaluation, metrics, regression

**Fields:**
- **y_true**: Ground truth values (NPArray)
- **y_pred**: Predicted values (NPArray)


## ROCCurveNode

Calculate ROC curve and AUC score.

Use cases:
- Binary classifier evaluation
- Model comparison
- Threshold selection

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_score**: Predicted probabilities or scores (NPArray)


## RecallNode

Calculate recall score for classification.

Use cases:
- Model evaluation
- Recall assessment

**Tags:** machine learning, evaluation, metrics, classification

**Fields:**
- **y_true**: Ground truth labels (NPArray)
- **y_pred**: Predicted labels (NPArray)
- **average**: Averaging strategy for multiclass: 'binary' (default), 'micro', 'macro', 'weighted' (ClassificationMetricsAverage)


## SilhouetteScoreNode

Calculate Silhouette score for clustering.

Use cases:
- Cluster quality assessment
- Clustering algorithm evaluation

**Tags:** machine learning, evaluation, metrics, clustering

**Fields:**
- **X**: Input samples (NPArray)
- **labels**: Cluster labels (NPArray)


