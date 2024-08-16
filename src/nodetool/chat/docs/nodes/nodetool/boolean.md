# nodetool.nodes.nodetool.boolean

## All

Checks if all boolean values in a list are True.

Use cases:
- Ensure all conditions in a set are met
- Implement comprehensive checks
- Validate multiple criteria simultaneously

**Fields:**
values: list

## BooleanOperation

An enumeration.

## Compare

Compares two values using a specified comparison operator.

Use cases:
- Implement decision points in workflows
- Filter data based on specific criteria
- Create dynamic thresholds or limits

**Fields:**
a: typing.Any
b: typing.Any
comparison: Comparison

## Comparison

An enumeration.

## If

Selects between two values based on a condition.

Use cases:
- Implement conditional logic in workflows
- Create dynamic output selection
- Handle different cases based on input conditions

**Fields:**
condition: bool
if_true: typing.Any
if_false: typing.Any

## IsIn

Checks if a value is present in a list of options.

Use cases:
- Validate input against a set of allowed values
- Implement category or group checks
- Filter data based on inclusion criteria

**Fields:**
value: typing.Any
options: list

## IsNone

Checks if a value is None.

Use cases:
- Validate input presence
- Handle optional parameters
- Implement null checks in data processing

**Fields:**
value: typing.Any

## LogicalOperator

Performs logical operations on two boolean inputs.

Use cases:
- Combine multiple conditions in decision-making
- Implement complex logical rules in workflows
- Create advanced filters or triggers

**Fields:**
a: bool
b: bool
operation: BooleanOperation

## Not

Performs logical NOT operation on a boolean input.

Use cases:
- Invert a condition's result
- Implement toggle functionality
- Create opposite logic branches

**Fields:**
value: bool

## Some

Checks if any boolean value in a list is True.

Use cases:
- Check if at least one condition in a set is met
- Implement optional criteria checks
- Create flexible validation rules

**Fields:**
values: list

