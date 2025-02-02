# nodetool.nodes.lib.ml.sklearn.decomposition

## NMFInit

## NMFNode

Non-Negative Matrix Factorization.

Use cases:
- Topic modeling
- Source separation
- Feature extraction for non-negative data

**Tags:** machine learning, dimensionality reduction, feature extraction

**Fields:**
- **X**: Non-negative features for decomposition (NPArray)
- **n_components**: Number of components (int)
- **init**: Method for initialization (NMFInit)
- **random_state**: Random state for reproducibility (int)
- **max_iter**: Maximum number of iterations (int)


## PCANode

Principal Component Analysis for dimensionality reduction.

Use cases:
- Dimensionality reduction
- Feature extraction
- Data visualization

**Tags:** machine learning, dimensionality reduction, feature extraction

**Fields:**
- **X**: Features for decomposition (NPArray)
- **n_components**: Number of components to keep (typing.Optional[int])
- **random_state**: Random state for reproducibility (typing.Optional[int])


## TruncatedSVDNode

Truncated Singular Value Decomposition (LSA).

Use cases:
- Text processing (LSA/LSI)
- Dimensionality reduction for sparse data
- Feature extraction

**Tags:** machine learning, dimensionality reduction, feature extraction

**Fields:**
- **X**: Features for decomposition (NPArray)
- **n_components**: Number of components (int)
- **random_state**: Random state for reproducibility (typing.Optional[int])
- **n_iter**: Number of iterations for randomized SVD (int)


