# nodetool.models.condition_builder

## Condition

## ConditionBuilder

### and_

**Args:**
- **other (ConditionBuilder)**

**Returns:** ConditionBuilder

### build

**Args:**

**Returns:** ConditionGroup

### get_variables

**Args:**

**Returns:** dict

### or_

**Args:**
- **other (ConditionBuilder)**

**Returns:** ConditionBuilder

## ConditionGroup

## Field

### equals

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### greater_than

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### greater_than_or_equal

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### in_list

**Args:**
- **values (typing.Union[typing.List[typing.Any], nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### less_than

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### less_than_or_equal

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### like

**Args:**
- **pattern (typing.Union[str, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

### not_equals

**Args:**
- **value (typing.Union[typing.Any, nodetool.models.condition_builder.Variable])**

**Returns:** ConditionBuilder

## LogicalOperator

An enumeration.

## Operator

An enumeration.

## Variable

