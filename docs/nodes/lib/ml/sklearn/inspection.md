# nodetool.nodes.lib.ml.sklearn.inspection

## PartialDependenceDisplayNode

Create Partial Dependence Plot (PDP) visualization data.

Use cases:
- Visualizing feature effects
- Model interpretation
- Feature relationship analysis

**Tags:** machine learning, model inspection, visualization

**Fields:**
- **model**: Fitted sklearn model (SKLearnModel)
- **X**: Training data (NPArray)
- **features**: Features for which to create PDP. Can be indices for 1D or tuples for 2D (tuple[typing.Union[int, tuple[int, int]]])
- **feature_names**: Comma separated names of features (str)
- **grid_resolution**: Number of points in the grid (int)
- **lower_percentile**: Lower percentile to compute the feature values range (float)
- **upper_percentile**: Upper percentile to compute the feature values range (float)
- **kind**: Kind of partial dependence result (PartialDependenceKind)


## PartialDependenceKind

## PartialDependenceNode

Calculate Partial Dependence for features.

Use cases:
- Feature impact visualization
- Model interpretation
- Understanding feature relationships

**Tags:** machine learning, model inspection, feature effects

**Fields:**
- **model**: Fitted sklearn model (SKLearnModel)
- **X**: Training data (NPArray)
- **features**: List of features for which to calculate PD. Each element can be an int for 1D PD or a list of 2 ints for 2D (tuple[int])
- **kind**: Kind of partial dependence result: 'average' or 'individual' (PartialDependenceKind)
- **grid_resolution**: Number of equally spaced points in the grid (int)


## PermutationImportanceNode

Calculate Permutation Feature Importance.

Use cases:
- Feature selection
- Model interpretation
- Identifying key predictors

**Tags:** machine learning, model inspection, feature importance

**Fields:**
- **model**: Fitted sklearn model (SKLearnModel)
- **X**: Validation data (NPArray)
- **y**: True labels/values (NPArray)
- **n_repeats**: Number of times to permute each feature (int)
- **random_state**: Random state for reproducibility (typing.Optional[int])
- **scoring**: Scoring metric (if None, uses estimator's default scorer) (typing.Optional[str])
- **n_jobs**: Number of jobs to run in parallel (typing.Optional[int])


