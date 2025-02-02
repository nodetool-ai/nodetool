# nodetool.nodes.lib.ml.statsmodels.discrete

## LogitNode

Logistic Regression using statsmodels.

Use cases:
- Binary classification
- Probability estimation
- Statistical inference for classification

**Tags:** statistics, regression, classification, logistic

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Binary target variable (0/1) (NPArray)


## MultinomialLogitNode

Multinomial Logistic Regression for nominal outcomes.

Use cases:
- Multiple category classification
- Nominal categorical outcomes
- Choice modeling

**Tags:** statistics, regression, multinomial, classification

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Categorical target variable (NPArray)


## NegativeBinomialNode

Negative Binomial Regression for overdispersed count data.

Use cases:
- Overdispersed count data
- When variance exceeds mean
- More flexible than Poisson

**Tags:** statistics, regression, count-data, negative-binomial

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Count data target variable (NPArray)
- **exposure**: Optional exposure variable (typing.Optional[nodetool.metadata.types.NPArray])
- **offset**: Optional offset term (typing.Optional[nodetool.metadata.types.NPArray])


## PoissonNode

Poisson Regression for count data.

Use cases:
- Modeling count data
- Rate data analysis
- Event frequency prediction

**Tags:** statistics, regression, count-data, poisson

**Fields:**
- **X**: Features/independent variables (NPArray)
- **y**: Count data target variable (NPArray)
- **exposure**: Optional exposure variable (typing.Optional[nodetool.metadata.types.NPArray])
- **offset**: Optional offset term (typing.Optional[nodetool.metadata.types.NPArray])


