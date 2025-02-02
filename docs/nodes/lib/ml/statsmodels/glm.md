# nodetool.nodes.lib.ml.statsmodels.glm

## GLMFamily

## GLMLink

## GLMNode

Generalized Linear Models using statsmodels.

Use cases:
- Various types of regression (linear, logistic, poisson, etc.)
- Handling non-normal error distributions
- Complex regression analysis

**Tags:** machine learning, regression, generalized linear models

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **family**: Error distribution family (GLMFamily)
- **link**: Link function (if None, uses canonical link) (typing.Optional[nodetool.nodes.lib.ml.statsmodels.glm.GLMLink])
- **alpha**: L2 regularization parameter (float)
- **max_iter**: Maximum number of iterations (int)


## GLMPredictNode

Make predictions using a fitted GLM model.

Use cases:
- Prediction with GLM models
- Out-of-sample prediction
- Model evaluation

**Tags:** machine learning, regression, prediction, generalized linear models

**Fields:**
- **model**: Fitted GLM model (SKLearnModel)
- **X**: Features to predict on (NPArray)


