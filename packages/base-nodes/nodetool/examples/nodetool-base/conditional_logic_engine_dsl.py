"""
Conditional Logic Engine DSL Example

Workflow that demonstrates multi-branch decision logic with value routing.

Workflow:
1. **Input Value** - Accept numeric input for evaluation
2. **Compare Conditions** - Evaluate multiple comparisons (>100, <50)
3. **Logical Operations** - Combine conditions with OR logic
4. **Conditional Switch** - Route to different handlers based on conditions
5. **Process Branches** - Three separate processing paths
6. **Format Output** - Combine and format results

This demonstrates:
- Multi-condition evaluation
- Conditional branching logic
- Multiple execution paths
- Result aggregation
- Decision tree patterns
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import IntegerInput
from nodetool.dsl.nodetool.boolean import Compare, LogicalOperator, ConditionalSwitch
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.output import Output


# Input: Numeric value to evaluate
value_input = IntegerInput(
    name="value",
    description="Numeric value to evaluate against multiple conditions",
    value=75,
)

# Condition 1: Is the value greater than 100?
compare_gt100 = Compare(
    a=value_input.output,
    b=100,
    comparison=Compare.Comparison.GREATER_THAN,
)

# Condition 2: Is the value less than 50?
compare_lt50 = Compare(
    a=value_input.output,
    b=50,
    comparison=Compare.Comparison.LESS_THAN,
)

# Logic: Combine conditions with OR (true if either condition is met)
combined_condition = LogicalOperator(
    a=compare_gt100.output,
    b=compare_lt50.output,
    operation=LogicalOperator.BooleanOperation.OR,
)

# Route based on the combined condition
# True: High or Low value
# False: Medium value
route_decision = ConditionalSwitch(
    condition=combined_condition.output,
    if_true="EXTREME_VALUE",  # High (>100) or Low (<50)
    if_false="MEDIUM_VALUE",  # Medium (50-100)
)

# Process Branch A: High value (>100)
high_value_text = FormatText(
    template="🔴 HIGH VALUE: {{ value }} is greater than 100. Priority processing engaged.",
    value=value_input.output,
)

# Process Branch B: Low value (<50)
low_value_text = FormatText(
    template="🔵 LOW VALUE: {{ value }} is less than 50. Standard processing applied.",
    value=value_input.output,
)

# Process Branch C: Medium value (50-100)
medium_value_text = FormatText(
    template="🟡 MEDIUM VALUE: {{ value }} is between 50 and 100. Balanced processing selected.",
    value=value_input.output,
)

# Conditional routing to select the appropriate processor
conditional_output = ConditionalSwitch(
    condition=compare_gt100.output,
    if_true=high_value_text.output,
    if_false=FormatText(
        template="{{ text }}",
        text=ConditionalSwitch(
            condition=compare_lt50.output,
            if_true=low_value_text.output,
            if_false=medium_value_text.output,
        ).output,
    ).output,
)

# Format final summary with decision logic explanation
summary_text = FormatText(
    template="""## Conditional Logic Decision Result

**Input Value:** {{ value }}

**Condition Checks:**
- Greater than 100? {{ gt_100 }}
- Less than 50? {{ lt_50 }}
- Combined (OR): {{ combined }}
- Route Decision: {{ route }}

**Processing Path:**
{{ processing }}

**Decision Logic:**
This workflow demonstrates:
- Multiple condition evaluation
- Logical operations (OR gate)
- Conditional branching
- Multi-path routing
- Result aggregation""",
    value=value_input.output,
    gt_100=compare_gt100.output,
    lt_50=compare_lt50.output,
    combined=combined_condition.output,
    route=route_decision.output,
    processing=conditional_output.output,
)

# Explicit output node
output = Output(
    name="decision_result",
    value=summary_text.output,
)

# Create the workflow graph
graph = create_graph(output)


# Main execution
if __name__ == "__main__":
    result = run_graph(graph)
    print("✅ Conditional logic evaluation complete!")
    print(result['decision_result'])
