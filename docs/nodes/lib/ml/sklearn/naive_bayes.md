# nodetool.nodes.lib.ml.sklearn.naive_bayes

## BernoulliNBNode

Bernoulli Naive Bayes classifier.

Use cases:
- Text classification with binary features
- Document classification
- Binary feature classification

**Tags:** machine learning, classification, naive bayes, probabilistic

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **alpha**: Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing) (float)
- **fit_prior**: Whether to learn class prior probabilities (bool)
- **binarize**: Threshold for binarizing features (None for no binarization) (typing.Optional[float])


## GaussianNBNode

Gaussian Naive Bayes classifier.

Use cases:
- Real-valued feature classification
- Fast training and prediction
- Baseline for classification tasks

**Tags:** machine learning, classification, naive bayes, probabilistic

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **var_smoothing**: Portion of the largest variance of all features that is added to variances for calculation stability (float)


## MultinomialNBNode

Multinomial Naive Bayes classifier.

Use cases:
- Text classification
- Document categorization
- Feature counts or frequencies

**Tags:** machine learning, classification, naive bayes, probabilistic

**Fields:**
- **X_train**: Training features (NPArray)
- **y_train**: Training target values (NPArray)
- **alpha**: Additive (Laplace/Lidstone) smoothing parameter (0 for no smoothing) (float)
- **fit_prior**: Whether to learn class prior probabilities (bool)


