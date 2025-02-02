# nodetool.nodes.lib.ml.statsmodels.robust

## MEstimator

## RLMNode

Robust Linear Model Regression.

Use cases:
- Regression with outliers
- Robust parameter estimation
- Non-normal error distributions

**Tags:** statistics, regression, robust, outliers

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Target/dependent variable (NPArray)
- **M**: M-estimator ('huber', 'bisquare', etc.) (MEstimator)


### get_m_estimator

**Args:**
- **m_estimator (MEstimator)**

