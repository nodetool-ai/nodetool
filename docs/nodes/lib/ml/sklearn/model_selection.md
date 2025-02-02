# nodetool.nodes.lib.ml.sklearn.model_selection

## GridSearchNode

Exhaustive search over specified parameter values.

Use cases:
- Hyperparameter optimization
- Model selection
- Automated model tuning

**Tags:** machine learning, hyperparameter tuning, model selection

**Fields:**
- **model**: Base sklearn model (SKLearnModel)
- **X**: Training features (NPArray)
- **y**: Training target values (NPArray)
- **param_grid**: Dictionary with parameters names (string) as keys and lists of parameter settings to try (typing.Dict[str, typing.List[typing.Any]])
- **cv**: Number of folds for cross-validation (int)
- **scoring**: Scoring metric to use for evaluation (typing.Optional[str])


## KFoldCrossValidationNode

K-Fold Cross Validation for model evaluation.

Use cases:
- Model performance estimation
- Hyperparameter tuning
- Assessing model stability

**Tags:** machine learning, model evaluation, cross validation

**Fields:**
- **model**: Sklearn model to evaluate (SKLearnModel)
- **X**: Features for cross validation (NPArray)
- **y**: Target values (NPArray)
- **n_splits**: Number of folds (int)
- **shuffle**: Whether to shuffle the data (bool)
- **random_state**: Random state for reproducibility (typing.Optional[int])


## TrainTestSplitNode

Split arrays into random train and test subsets.

Use cases:
- Preparing data for model training
- Model evaluation
- Preventing data leakage

**Tags:** machine learning, data splitting, model evaluation

**Fields:**
- **X**: Features to split (NPArray)
- **y**: Target values to split (NPArray)
- **test_size**: Proportion of the dataset to include in the test split (float)
- **random_state**: Random state for reproducibility (typing.Optional[int])
- **shuffle**: Whether to shuffle the data (bool)


