# nodetool.nodes.lib.ml.sklearn.tree

## DecisionTreeClassifierNode

Decision Tree Classifier.

Use cases:
- Classification with interpretable results
- Feature importance analysis
- Handling both numerical and categorical data

**Tags:** machine learning, classification, tree

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **max_depth**: Maximum depth of the tree (typing.Optional[int])
- **min_samples_split**: Minimum samples required to split a node (int)
- **min_samples_leaf**: Minimum samples required at a leaf node (int)
- **criterion**: Function to measure quality of split ('gini' or 'entropy') (DecisionTreeCriterion)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## DecisionTreeCriterion

## DecisionTreeRegressorCriterion

## DecisionTreeRegressorNode

Decision Tree Regressor.

Use cases:
- Regression with interpretable results
- Non-linear relationships
- Feature importance analysis

**Tags:** machine learning, regression, tree

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **max_depth**: Maximum depth of the tree (typing.Optional[int])
- **min_samples_split**: Minimum samples required to split a node (int)
- **min_samples_leaf**: Minimum samples required at a leaf node (int)
- **criterion**: Function to measure quality of split ('squared_error', 'friedman_mse', 'absolute_error', 'poisson') (DecisionTreeRegressorCriterion)
- **random_state**: Random state for reproducibility (typing.Optional[int])


