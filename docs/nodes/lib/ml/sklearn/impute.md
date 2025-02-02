# nodetool.nodes.lib.ml.sklearn.impute

## KNNImputerNode

Imputation using k-Nearest Neighbors.

Use cases:
- Advanced missing value imputation
- Preserving data relationships
- Handling multiple missing values

**Tags:** machine learning, preprocessing, imputation, missing values, knn

**Fields:**
- **X**: Input data with missing values (NPArray)
- **n_neighbors**: Number of neighboring samples to use for imputation (int)
- **weights**: Weight function used in prediction: 'uniform' or 'distance' (str)
- **metric**: Distance metric for searching neighbors (str)
- **missing_values**: Placeholder for missing values. Can be np.nan or numeric value (typing.Union[str, float])


## SimpleImputerNode

Imputation transformer for completing missing values.

Use cases:
- Handling missing values in datasets
- Basic data cleaning
- Preparing data for ML models

**Tags:** machine learning, preprocessing, imputation, missing values

**Fields:**
- **X**: Input data with missing values (NPArray)
- **strategy**: Imputation strategy: 'mean', 'median', 'most_frequent', or 'constant' (str)
- **fill_value**: Value to use when strategy is 'constant'. Can be str or numeric (typing.Union[str, float, NoneType])
- **missing_values**: Placeholder for missing values. Can be np.nan or numeric value (typing.Union[str, float])


