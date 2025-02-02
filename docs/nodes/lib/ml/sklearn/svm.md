# nodetool.nodes.lib.ml.sklearn.svm

## LinearSVMClassifierNode

Linear Support Vector Machine Classifier.

Use cases:
- Large-scale classification
- Text classification
- High-dimensional data

**Tags:** machine learning, classification, svm, linear

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **C**: Regularization parameter (float)
- **max_iter**: Maximum number of iterations (int)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## SVMClassifierNode

Support Vector Machine Classifier with kernel.

Use cases:
- Binary and multiclass classification
- Non-linear classification
- Text classification

**Tags:** machine learning, classification, svm

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **C**: Regularization parameter (float)
- **kernel**: Kernel type: 'linear', 'poly', 'rbf', 'sigmoid' (str)
- **degree**: Degree of polynomial kernel function (int)
- **gamma**: Kernel coefficient for 'rbf', 'poly' and 'sigmoid' (str)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## SVMRegressorNode

Support Vector Machine Regressor.

Use cases:
- Non-linear regression
- Robust regression
- Time series prediction

**Tags:** machine learning, regression, svm

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **C**: Regularization parameter (float)
- **kernel**: Kernel type: 'linear', 'poly', 'rbf', 'sigmoid' (str)
- **degree**: Degree of polynomial kernel function (int)
- **gamma**: Kernel coefficient for 'rbf', 'poly' and 'sigmoid' (str)
- **epsilon**: Epsilon in the epsilon-SVR model (float)


