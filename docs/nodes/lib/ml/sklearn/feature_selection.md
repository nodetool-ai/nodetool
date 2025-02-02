# nodetool.nodes.lib.ml.sklearn.feature_selection

## RecursiveFeatureEliminationNode

Feature ranking with recursive feature elimination.

Use cases:
- Feature ranking
- Optimal feature subset selection
- Model-based feature selection

**Tags:** machine learning, feature selection, recursive elimination

**Fields:**
- **X**: Features to select from (NPArray)
- **y**: Target values (NPArray)
- **estimator**: Base estimator for feature selection (SKLearnModel)
- **n_features_to_select**: Number of features to select (typing.Optional[int])
- **step**: Number of features to remove at each iteration (int) or percentage (float) (float)


## SelectKBestNode

Select features according to k highest scores.

Use cases:
- Dimensionality reduction
- Feature importance ranking
- Removing irrelevant features

**Tags:** machine learning, feature selection, statistical tests

**Fields:**
- **X**: Features to select from (NPArray)
- **y**: Target values (NPArray)
- **k**: Number of top features to select (int)
- **score_func**: Scoring function ('f_classif' for classification, 'f_regression' for regression) (str)


## VarianceThresholdNode

Feature selector that removes low-variance features.

Use cases:
- Remove constant features
- Remove quasi-constant features
- Basic feature filtering

**Tags:** machine learning, feature selection, variance

**Fields:**
- **X**: Features to select from (NPArray)
- **threshold**: Features with a variance lower than this threshold will be removed (float)


