import ast
from typing import Any, Dict
from pydantic import Field
from nodetool.common.environment import Environment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ExecutePython(BaseNode):
    """
    Executes Python code with safety restrictions.
    python, code, execute

    Use cases:
    - Run custom data transformations
    - Prototype node functionality
    - Debug and testing workflows

    IMPORTANT: Only enabled in non-production environments
    """

    code: str = Field(
        default="",
        description="Python code to execute. Input variables are available as locals. Assign the desired output to the 'result' variable.",
    )

    inputs: Dict[str, Any] = Field(
        default={},
        description="Input variables available to the code as locals.",
    )

    async def process(self, context: ProcessingContext) -> Any:
        if Environment.is_production():
            raise RuntimeError("Python code execution is disabled in production")

        if not self.code.strip():
            return None

        # Basic static analysis for dangerous operations
        tree = ast.parse(self.code)
        for node in ast.walk(tree):
            # Block imports
            if isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom):
                raise ValueError("Import statements are not allowed")

            # Block file operations
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id in ["open", "eval", "exec"]:
                        raise ValueError(f"Function {node.func.id}() is not allowed")

        # Create restricted globals
        restricted_globals = {
            "__builtins__": {
                "abs": abs,
                "all": all,
                "any": any,
                "bool": bool,
                "dict": dict,
                "float": float,
                "int": int,
                "len": len,
                "list": list,
                "max": max,
                "min": min,
                "range": range,
                "round": round,
                "str": str,
                "sum": sum,
                "tuple": tuple,
                "zip": zip,
            }
        }

        # Execute in restricted environment
        try:
            exec(self.code, restricted_globals, self.inputs)
            return self.inputs.get("result", None)
        except Exception as e:
            raise RuntimeError(f"Error executing Python code: {str(e)}")


class EvaluateExpression(BaseNode):
    """
    Evaluates a Python expression with safety restrictions.
    python, expression, evaluate

    Use cases:
    - Calculate values dynamically
    - Transform data with simple expressions
    - Quick data validation

    IMPORTANT: Only enabled in non-production environments
    """

    expression: str = Field(
        default="",
        description="Python expression to evaluate. Variables are available as locals.",
    )

    variables: Dict[str, Any] = Field(
        default={}, description="Variables available to the expression"
    )

    async def process(self, context: ProcessingContext) -> Any:
        if Environment.is_production():
            raise RuntimeError("Python expression evaluation is disabled in production")

        if not self.expression.strip():
            return None

        # Basic static analysis
        tree = ast.parse(self.expression, mode="eval")
        for node in ast.walk(tree):
            if isinstance(node, (ast.Call, ast.Import, ast.ImportFrom)):
                raise ValueError(
                    "Function calls and imports are not allowed in expressions"
                )

        # Create restricted environment
        restricted_globals = {
            "__builtins__": {
                "abs": abs,
                "all": all,
                "any": any,
                "bool": bool,
                "float": float,
                "int": int,
                "len": len,
                "max": max,
                "min": min,
                "round": round,
                "str": str,
                "sum": sum,
            }
        }

        try:
            return eval(self.expression, restricted_globals, self.variables)
        except Exception as e:
            raise RuntimeError(f"Error evaluating expression: {str(e)}")
