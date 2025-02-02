# nodetool.nodes.lib.ml.sklearn.neighbors

## KNNClassifierNode

K-Nearest Neighbors Classifier.

Use cases:
- Pattern recognition
- Classification based on similar examples
- Non-parametric classification

**Tags:** machine learning, classification, neighbors

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_neighbors**: Number of neighbors (int)
- **weights**: Weight function used in prediction ('uniform' or 'distance') (KNNWeights)
- **metric**: Distance metric to use (KNNMetric)
- **p**: Power parameter for Minkowski metric (p=2 is Euclidean) (int)


## KNNMetric

## KNNRegressorNode

K-Nearest Neighbors Regressor.

Use cases:
- Non-parametric regression
- Local approximation
- Continuous value prediction

**Tags:** machine learning, regression, neighbors

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **n_neighbors**: Number of neighbors (int)
- **weights**: Weight function used in prediction ('uniform' or 'distance') (KNNWeights)
- **metric**: Distance metric to use (KNNMetric)
- **p**: Power parameter for Minkowski metric (p=2 is Euclidean) (int)


## KNNWeights

## NearestNeighbors

Stores input embeddings in a database and retrieves the nearest neighbors for a query embedding.

**Tags:** array, embeddings, nearest neighbors, search, similarity

**Fields:**
- **documents**: The list of documents to search (list[nodetool.metadata.types.NPArray])
- **query**: The query to search for (NPArray)
- **n_neighbors**: The number of neighbors to return (int)


