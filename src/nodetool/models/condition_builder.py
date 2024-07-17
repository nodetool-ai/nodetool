from typing import Any, List, Union
from enum import Enum


class Operator(Enum):
    EQ = "="
    NE = "!="
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    IN = "IN"
    LIKE = "LIKE"


class LogicalOperator(Enum):
    AND = "AND"
    OR = "OR"


class Variable:
    def __init__(self, name: str):
        self.name = name


class Condition:
    def __init__(self, field: str, operator: Operator, value: Any):
        self.field = field
        self.operator = operator
        self.value = value


class ConditionGroup:
    def __init__(
        self,
        conditions: List[Union["ConditionGroup", Condition]],
        operator: LogicalOperator,
    ):
        self.conditions = conditions
        self.operator = operator


class Field:
    def __init__(self, name: str):
        self.name = name

    def _create_condition(
        self, operator: Operator, value: Union[Any, Variable]
    ) -> "ConditionBuilder":
        return ConditionBuilder(Condition(self.name, operator, value))

    def equals(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.EQ, value)

    def not_equals(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.NE, value)

    def greater_than(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.GT, value)

    def less_than(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.LT, value)

    def greater_than_or_equal(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.GTE, value)

    def less_than_or_equal(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.LTE, value)

    def in_list(self, values: Union[List[Any], Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.IN, values)

    def like(self, pattern: Union[str, Variable]) -> "ConditionBuilder":
        return self._create_condition(Operator.LIKE, pattern)

    def __eq__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.equals(value)

    def __ne__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.not_equals(value)

    def __gt__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.greater_than(value)

    def __lt__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.less_than(value)

    def __ge__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.greater_than_or_equal(value)

    def __le__(self, value: Union[Any, Variable]) -> "ConditionBuilder":
        return self.less_than_or_equal(value)

    def __contains__(self, value: Union[List[Any], Variable]) -> "ConditionBuilder":
        return self.in_list(value)


class ConditionBuilder:
    def __init__(self, condition: Union[Condition, ConditionGroup]):
        self.root = ConditionGroup([condition], LogicalOperator.AND)

    def _add_condition(
        self, other: "ConditionBuilder", operator: LogicalOperator
    ) -> "ConditionBuilder":
        if (
            isinstance(self.root.conditions[0], Condition)
            and len(self.root.conditions) == 1
        ):
            self.root.conditions = [self.root.conditions[0], other.root.conditions[0]]
            self.root.operator = operator
        else:
            new_root = ConditionGroup([self.root, other.root], operator)
            self.root = new_root
        return self

    def and_(self, other: "ConditionBuilder") -> "ConditionBuilder":
        return self._add_condition(other, LogicalOperator.AND)

    def or_(self, other: "ConditionBuilder") -> "ConditionBuilder":
        return self._add_condition(other, LogicalOperator.OR)

    def build(self) -> ConditionGroup:
        return self.root

    def _get_variables(
        self, values: dict[str, Any], condition: Union[Condition, ConditionGroup]
    ):
        if isinstance(condition, Condition):
            if isinstance(condition.value, Variable):
                values[condition.value.name] = None
        else:
            for sub_condition in condition.conditions:
                self._get_variables(values, sub_condition)

    def get_variables(self) -> dict[str, Any]:
        values = {}
        self._get_variables(values, self.root)
        return values


# Example usage:
# condition = Field("age").greater_than(Variable("min_age")).and_(Field("name").like(Variable("name_pattern")))
# built_condition = condition.build()
