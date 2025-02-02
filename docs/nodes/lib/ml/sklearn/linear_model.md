# nodetool.nodes.lib.ml.sklearn.linear_model

## LassoRegressionNode

Fits a lasso regression model (L1 regularization).

Use cases:
- Feature selection
- Sparse solutions

**Tags:** machine learning, regression, regularization, feature selection

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **alpha**: Regularization strength (float)


## LinearRegressionNode

Fits a linear regression model.

Use cases:
- Predict continuous values
- Find linear relationships between variables

**Tags:** machine learning, regression, linear model

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **fit_intercept**: Whether to calculate the intercept (bool)


## LogisticRegressionNode

Fits a logistic regression model for classification.

Use cases:
- Binary classification problems
- Probability estimation

**Tags:** machine learning, classification, logistic regression

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (binary) (NPArray)
- **C**: Inverse of regularization strength (float)
- **max_iter**: Maximum number of iterations (int)


## RidgeRegressionNode

Fits a ridge regression model (L2 regularization).

Use cases:
- Handle multicollinearity
- Prevent overfitting

**Tags:** machine learning, regression, regularization

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **alpha**: Regularization strength (float)


