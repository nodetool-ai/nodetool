# nodetool.nodes.nodetool.boolean

## All

Checks if all boolean values in a list are True.

Use cases:
- Ensure all conditions in a set are met
- Implement comprehensive checks
- Validate multiple criteria simultaneously

**Tags:** boolean, all, check

**Fields:**
- **values**: List of boolean values to check (list)


## BooleanOperation

An enumeration.

## Compare

Compares two values using a specified comparison operator.

Use cases:
- Implement decision points in workflows
- Filter data based on specific criteria
- Create dynamic thresholds or limits

**Tags:** compare, condition, logic

**Fields:**
- **a**: First value to compare (typing.Any)
- **b**: Second value to compare (typing.Any)
- **comparison**: Comparison operator to use (Comparison)


## Comparison

An enumeration.

## If

Selects between two values based on a condition.

Use cases:
- Implement conditional logic in workflows
- Create dynamic output selection
- Handle different cases based on input conditions

**Tags:** conditional, if-else, branch

**Fields:**
- **condition**: The condition to evaluate (bool)
- **if_true**: Value to return if the condition is true (typing.Any)
- **if_false**: Value to return if the condition is false (typing.Any)


## IsIn

Checks if a value is present in a list of options.

Use cases:
- Validate input against a set of allowed values
- Implement category or group checks
- Filter data based on inclusion criteria

**Tags:** membership, contains, check

**Fields:**
- **value**: The value to check for membership (typing.Any)
- **options**: The list of options to check against (list)


## IsNone

Checks if a value is None.

Use cases:
- Validate input presence
- Handle optional parameters
- Implement null checks in data processing

**Tags:** null, none, check

**Fields:**
- **value**: The value to check for None (typing.Any)


## LogicalOperator

Performs logical operations on two boolean inputs.

Use cases:
- Combine multiple conditions in decision-making
- Implement complex logical rules in workflows
- Create advanced filters or triggers

**Tags:** boolean, logic, operator

**Fields:**
- **a**: First boolean input (bool)
- **b**: Second boolean input (bool)
- **operation**: Logical operation to perform (BooleanOperation)


## Not

Performs logical NOT operation on a boolean input.

Use cases:
- Invert a condition's result
- Implement toggle functionality
- Create opposite logic branches

**Tags:** boolean, logic, not, invert

**Fields:**
- **value**: Boolean input to negate (bool)


## Some

Checks if any boolean value in a list is True.

Use cases:
- Check if at least one condition in a set is met
- Implement optional criteria checks
- Create flexible validation rules

**Tags:** boolean, any, check

**Fields:**
- **values**: List of boolean values to check (list)


