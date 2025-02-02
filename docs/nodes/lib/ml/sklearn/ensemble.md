# nodetool.nodes.lib.ml.sklearn.ensemble

## GradientBoostingClassifierNode

Gradient Boosting Classifier.

Use cases:
- High-performance classification
- Handling imbalanced datasets
- Complex decision boundaries

**Tags:** machine learning, classification, ensemble, boosting

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_estimators**: Number of boosting stages (int)
- **learning_rate**: Learning rate shrinks the contribution of each tree (float)
- **max_depth**: Maximum depth of the trees (int)
- **min_samples_split**: Minimum samples required to split a node (int)
- **subsample**: Fraction of samples used for fitting the trees (float)
- **random_state**: Random state for reproducibility (int)


## GradientBoostingLoss

## GradientBoostingRegressorNode

Gradient Boosting Regressor.

Use cases:
- High-performance regression
- Complex function approximation
- Robust predictions

**Tags:** machine learning, regression, ensemble, boosting

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_estimators**: Number of boosting stages (int)
- **learning_rate**: Learning rate shrinks the contribution of each tree (float)
- **max_depth**: Maximum depth of the trees (int)
- **min_samples_split**: Minimum samples required to split a node (int)
- **subsample**: Fraction of samples used for fitting the trees (float)
- **loss**: Loss function to be optimized ('squared_error', 'absolute_error', 'huber', 'quantile') (GradientBoostingLoss)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## RandomForestClassifierNode

Random Forest Classifier.

Use cases:
- Complex classification tasks
- Feature importance analysis
- Robust to overfitting

**Tags:** machine learning, classification, ensemble, tree

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_estimators**: Number of trees in the forest (int)
- **max_depth**: Maximum depth of the trees (typing.Optional[int])
- **min_samples_split**: Minimum samples required to split a node (int)
- **min_samples_leaf**: Minimum samples required at a leaf node (int)
- **criterion**: Function to measure quality of split ('gini' or 'entropy') (RandomForestCriterion)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## RandomForestCriterion

## RandomForestLoss

## RandomForestRegressorNode

Random Forest Regressor.

Use cases:
- Complex regression tasks
- Feature importance analysis
- Robust predictions

**Tags:** machine learning, regression, ensemble, tree

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_estimators**: Number of trees in the forest (int)
- **max_depth**: Maximum depth of the trees (typing.Optional[int])
- **min_samples_split**: Minimum samples required to split a node (int)
- **min_samples_leaf**: Minimum samples required at a leaf node (int)
- **criterion**: Function to measure quality of split ('squared_error', 'absolute_error', 'friedman_mse', 'poisson') (RandomForestLoss)
- **random_state**: Random state for reproducibility (int)


