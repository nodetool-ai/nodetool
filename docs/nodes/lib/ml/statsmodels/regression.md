# nodetool.nodes.lib.ml.statsmodels.regression

## OLSNode

Ordinary Least Squares Regression.

Use cases:
- Linear regression analysis
- Statistical inference
- Hypothesis testing

**Tags:** statistics, regression, linear model

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Target/dependent variable (NPArray)
- **add_constant**: Add a constant term to the model (bool)


## WLSNode

Weighted Least Squares Regression.

Use cases:
- Heteroscedastic data
- Varying observation reliability
- Weighted regression analysis

**Tags:** statistics, regression, linear model, weighted

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Target/dependent variable (NPArray)
- **weights**: Weights for observations (float)
- **add_constant**: Add a constant term to the model (bool)


