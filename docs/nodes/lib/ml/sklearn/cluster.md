# nodetool.nodes.lib.ml.sklearn.cluster

## AgglomerativeClusteringLinkage

## AgglomerativeClusteringNode

Hierarchical clustering using a bottom-up approach.

Use cases:
- Hierarchical data organization
- Taxonomy creation
- Document hierarchies

**Tags:** machine learning, clustering, unsupervised, hierarchical

**Fields:**
- **X**: Features for clustering (NPArray)
- **n_clusters**: Number of clusters (int)
- **linkage**: Linkage criterion: 'ward', 'complete', 'average', 'single' (AgglomerativeClusteringLinkage)
- **metric**: Metric used for distance computation (str)


## DBSCANNode

Density-Based Spatial Clustering of Applications with Noise.

Use cases:
- Anomaly detection
- Spatial clustering
- Finding clusters of arbitrary shape

**Tags:** machine learning, clustering, unsupervised, density-based

**Fields:**
- **X**: Features for clustering (NPArray)
- **eps**: Maximum distance between samples for neighborhood (float)
- **min_samples**: Minimum number of samples in a neighborhood (int)
- **metric**: Metric to compute distances (str)


## KMeansNode

K-Means clustering algorithm.

Use cases:
- Customer segmentation
- Image compression
- Document clustering

**Tags:** machine learning, clustering, unsupervised

**Fields:**
- **X**: Features for clustering (NPArray)
- **n_clusters**: Number of clusters (int)
- **random_state**: Random state for reproducibility (typing.Optional[int])
- **max_iter**: Maximum number of iterations (int)


