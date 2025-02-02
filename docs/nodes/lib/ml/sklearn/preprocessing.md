# nodetool.nodes.lib.ml.sklearn.preprocessing

## MinMaxScalerNode

Scale features to a given range.

Use cases:
- Feature scaling to fixed range
- Neural network input preparation
- Image processing

**Tags:** machine learning, preprocessing, scaling

**Fields:**
- **X**: Features to scale (NPArray)
- **feature_range**: Desired range of transformed data (tuple)


## NormalizerNode

Normalize samples individually to unit norm.

Use cases:
- Text classification
- Feature normalization
- Preparing data for cosine similarity

**Tags:** machine learning, preprocessing, normalization

**Fields:**
- **X**: Features to normalize (NPArray)
- **norm**: The norm to use: 'l1', 'l2', or 'max' (NormalizerNorm)


## NormalizerNorm

## RobustScalerNode

Scale features using statistics that are robust to outliers.

Use cases:
- Handling datasets with outliers
- Robust feature scaling
- Preprocessing for robust models

**Tags:** machine learning, preprocessing, scaling, outliers

**Fields:**
- **X**: Features to scale (NPArray)
- **with_centering**: If True, center the data before scaling (bool)
- **with_scaling**: If True, scale the data to unit variance (bool)
- **quantile_range**: Quantile range used to calculate scale_ (tuple)


## StandardScalerNode

Standardize features by removing the mean and scaling to unit variance.

Use cases:
- Feature normalization
- Preparing data for ML algorithms
- Handling different scales in features

**Tags:** machine learning, preprocessing, scaling

**Fields:**
- **X**: Features to standardize (NPArray)
- **with_mean**: If True, center the data before scaling (bool)
- **with_std**: If True, scale the data to unit variance (bool)


## TransformNode

Transform new data using a fitted preprocessing model.

Use cases:
- Applying fitted preprocessing to new data
- Consistent data transformation
- Pipeline preprocessing

**Tags:** machine learning, preprocessing, transformation

**Fields:**
- **model**: Fitted preprocessing model (SKLearnModel)
- **X**: Features to transform (NPArray)


