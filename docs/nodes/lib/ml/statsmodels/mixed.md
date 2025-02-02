# nodetool.nodes.lib.ml.statsmodels.mixed

## MixedLMNode

Linear Mixed Effects Model.

Use cases:
- Hierarchical/nested data
- Repeated measures analysis
- Longitudinal data analysis
- Clustered data

**Tags:** statistics, regression, mixed effects, hierarchical model

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Target/dependent variable (NPArray)
- **groups**: Group labels for random effects (NPArray)
- **use_reml**: Use REML estimation (bool)
- **maxiter**: Maximum number of iterations (int)


## MixedLMPredictNode

Make predictions using a fitted Mixed Linear Model.

Use cases:
- Prediction with mixed effects models
- Out-of-sample prediction
- Model evaluation

**Tags:** statistics, regression, prediction, mixed effects

**Fields:**
- **model**: Fitted Mixed LM model (StatsModelsModel)
- **X**: Features for prediction (NPArray)
- **groups**: Group labels for prediction (NPArray)
- **confidence_level**: Confidence level for prediction intervals (between 0 and 1) (float)


