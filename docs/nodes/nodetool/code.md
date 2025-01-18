# nodetool.nodes.nodetool.code

## EvaluateExpression

Evaluates a Python expression with safety restrictions.

Use cases:
- Calculate values dynamically
- Transform data with simple expressions
- Quick data validation

IMPORTANT: Only enabled in non-production environments

**Tags:** python, expression, evaluate

**Fields:**
- **expression**: Python expression to evaluate. Variables are available as locals. (str)
- **variables**: Variables available to the expression (typing.Dict[str, typing.Any])


## ExecutePython

Executes Python code with safety restrictions.

Use cases:
- Run custom data transformations
- Prototype node functionality
- Debug and testing workflows

IMPORTANT: Only enabled in non-production environments

**Tags:** python, code, execute

**Fields:**
- **code**: Python code to execute. Input variables are available as locals. Assign the desired output to the 'result' variable. (str)
- **inputs**: Input variables available to the code as locals. (typing.Dict[str, typing.Any])


