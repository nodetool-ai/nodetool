from turtle import pd

from matplotlib import pyplot as plt
from matplotlib.figure import Figure
from nodetool.chat.chat import json_schema_for_column, process_messages
from nodetool.metadata.types import (
    BaseType,
    ChartConfig,
    DataframeRef,
    FunctionModel,
    GPTModel,
    ImageRef,
    Message,
    Provider,
    RecordType,
    SVGElement,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field

import matplotlib.pyplot as plt
import io
import pandas as pd
from matplotlib.figure import Figure
from matplotlib.backends.backend_svg import FigureCanvasSVG
import numpy as np

import json
import asyncio
import json
from urllib.parse import urljoin
import uuid
import re

from typing import Any, Literal
from pydantic import Field
from nodetool.chat.chat import (
    process_messages,
    process_tool_calls,
)
from nodetool.chat.tools import ProcessNodeTool
from nodetool.metadata.types import (
    DataframeRef,
    FunctionModel,
    GPTModel,
    ImageRef,
    LlamaModel,
    NodeRef,
    Provider,
    Task,
)
from nodetool.providers.openai.prediction import run_openai
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message

import statsmodels.api as sm


class Agent(BaseNode):
    """
    Agent node to plan tasks to achieve a goal.
    task planning, goal decomposition, workflow generation

    Use cases:
    - Breaking down complex goals into manageable tasks
    - Creating dependency graphs for multi-step processes
    - Generating workflows for automated task execution
    """

    goal: str = Field(
        default="",
        description="The user prompt",
    )
    max_tokens: int = Field(
        default=1000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )

    async def process(self, context: ProcessingContext) -> list[Task]:
        thread_id = uuid.uuid4().hex
        input_messages = [
            Message(
                role="system",
                thread_id=thread_id,
                content="""
                Generate a full list of tasks to achieve the goal below.
                Model the tasks as a directed acyclic graph (DAG) with dependencies.
                Use given tools to create tasks and dependencies.
                These tasks will be executed in order to achieve the goal.
                The output of each task will be available to dependent tasks.
                Tasks will be executed by specialized models and tools.
                Describe each task in detail.
                """,
            ),
            Message(
                role="user",
                thread_id=thread_id,
                content=self.goal,
            ),
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=input_messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "tasks",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "tasks": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "type": {
                                            "type": "string",
                                            "enum": ["text", "image"],
                                        },
                                        "instructions": {"type": "string"},
                                        "dependencies": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                    "required": [
                                        "name",
                                        "type",
                                        "instructions",
                                        "dependencies",
                                    ],
                                    "additionalProperties": False,
                                },
                            }
                        },
                        "required": ["tasks"],
                        "additionalProperties": False,
                    },
                },
            },
        )

        tasks_data = json.loads(str(assistant_message.content)).get("tasks", [])

        created_tasks = []
        for task_data in tasks_data:
            task = Task(
                task_type=task_data["type"],
                name=task_data["name"],
                instructions=task_data["instructions"],
                dependencies=task_data.get("dependencies", []),
            )
            created_tasks.append(task)

        return created_tasks


class RunTasks(BaseNode):
    """
    Process a task using specified models and tools.
    task execution, model integration, tool coordination

    Use cases:
    - Executing tasks defined by AgentNode
    - Coordinating between different AI models and tools
    - Generating outputs based on task instructions
    """

    tasks: list[Task] = Field(
        default=[],
        description="The task to process.",
    )
    image_nodes: list[NodeRef] = Field(
        default_factory=list,
        description="The image generation nodes to use.",
    )
    max_tokens: int = Field(
        default=1000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )

    def topological_sort(self, tasks: list[Task]) -> list[Task]:
        """
        Perform a topological sort on the tasks to determine the order of execution.
        """
        tasks_by_name = {task.name: task for task in tasks}
        dependencies = {task.name: task.dependencies for task in tasks}

        def visit(task_name, visited, stack):
            if task_name in stack:
                raise ValueError("Cycle detected in task dependencies")
            if task_name not in visited:
                stack.add(task_name)
                for dep in dependencies[task_name]:
                    visit(dep, visited, stack)
                stack.remove(task_name)
                visited.add(task_name)

        visited = set()
        sorted_tasks = []
        for task_name in tasks_by_name:
            visit(task_name, visited, set())
        for task_name in visited:
            sorted_tasks.append(tasks_by_name[task_name])

        return sorted_tasks

    async def process_task(
        self,
        thread_id: str,
        task: Task,
        tasks_by_name: dict[str, Task],
        context: ProcessingContext,
    ) -> str:
        dependent_results = [
            tasks_by_name[dep].result
            for dep in task.dependencies
            if dep in tasks_by_name
        ]
        input_messages = [
            Message(
                role="system",
                content=f"""
                You are a friendly assistant who helps with tasks.
                Generate a response to the task insctructions below.
                Follow the instructions carefully.
                Use the given tools to generate the output.
                Do not make more than one tool call per message.
                These are the results from the dependencies:
                {dependent_results}
                """,
            ),
            Message(
                role="user",
                content=task.instructions,
            ),
        ]
        tools = [ProcessNodeTool(node.id) for node in self.image_nodes]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            tools=tools,
            messages=input_messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        if (
            assistant_message.tool_calls is not None
            and len(assistant_message.tool_calls) > 0
        ):
            tool_calls = await process_tool_calls(
                context=context,
                tool_calls=assistant_message.tool_calls,
                tools=tools,
            )
            return tool_calls[0].result["output"]
        else:
            return str(assistant_message.content)

    async def process(self, context: ProcessingContext) -> list[Any]:
        thread_id = uuid.uuid4().hex
        tasks = self.topological_sort(self.tasks)
        for task in tasks:
            task.result = await self.process_task(
                thread_id=thread_id,
                task=task,
                tasks_by_name={task.name: task for task in self.tasks},
                context=context,
            )
        return tasks


class DataGenerator(BaseNode):
    """
    LLM Agent to create a dataframe based on a user prompt.
    llm, dataframe creation, data structuring

    Use cases:
    - Generating structured data from natural language descriptions
    - Creating sample datasets for testing or demonstration
    - Converting unstructured text into tabular format
    """

    prompt: str = Field(
        default="",
        description="The user prompt",
    )
    input_text: str = Field(
        default="",
        description="The input text to be analyzed by the agent.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to use in the prompt.",
    )
    max_tokens: int = Field(
        default=1000,
        ge=0,
        le=10000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=1.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns to use in the dataframe.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        system_message = Message(
            role="system",
            content="You are an assistant with access to tools.",
        )

        user_message = Message(
            role="user",
            content=self.prompt + "\n\n" + self.input_text,
        )
        messages = [system_message, user_message]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "datatable",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "data": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        column.name: json_schema_for_column(column)
                                        for column in self.columns.columns
                                    },
                                    "required": [
                                        column.name for column in self.columns.columns
                                    ],
                                    "additionalProperties": False,
                                },
                            }
                        },
                        "required": ["data"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
            },
        )
        data = [
            [
                (row[col.name] if col.name in row else None)
                for col in self.columns.columns
            ]
            for row in json.loads(str(assistant_message.content)).get("data", [])
        ]
        return DataframeRef(columns=self.columns.columns, data=data)


class ThoughtStep(BaseType):
    """
    A step in a chain-of-thought reasoning process.
    """

    type: Literal["thought_step"] = "thought_step"
    step_number: int = 0
    instructions: str = ""
    reasoning: str = ""
    result: str = ""


class ChainOfThought(BaseNode):
    """
    Agent node that implements chain-of-thought reasoning to break down complex problems
    into step-by-step solutions.

    Use cases:
    - Complex problem solving requiring multiple steps
    - Mathematical calculations with intermediate steps
    - Logical reasoning and deduction tasks
    - Step-by-step analysis of scenarios
    """

    prompt: str = Field(
        default="",
        description="The problem or question to analyze",
    )
    max_tokens: int = Field(
        default=2000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )

    @classmethod
    def return_type(cls):
        return {
            "analysis": str,
            "steps": list[ThoughtStep],
        }

    async def process(self, context: ProcessingContext) -> dict:
        input_messages = [
            Message(
                role="system",
                content="""
                You are an expert at breaking down complex problems into clear steps.
                For any given problem:
                1. First analyze and understand the key components
                2. Break down the solution into logical steps
                3. Give instructions for each step
                
                Provide your response in a structured JSON format with:
                - analysis: Initial problem analysis
                - steps: Array of reasoning steps
                """,
            ),
            Message(
                role="user",
                content=self.prompt,
            ),
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=input_messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chain_of_thought",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "analysis": {"type": "string"},
                            "steps": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "step_number": {"type": "integer"},
                                        "instructions": {"type": "string"},
                                    },
                                    "additionalProperties": False,
                                    "required": [
                                        "step_number",
                                        "instructions",
                                    ],
                                },
                            },
                        },
                        "required": ["analysis", "steps"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
            },
        )

        result = json.loads(str(assistant_message.content))
        return {
            "analysis": result["analysis"],
            "steps": [ThoughtStep(**step) for step in result["steps"]],
        }


class ProcessChainOfThought(BaseNode):
    """
    Agent node that implements iterative chain-of-thought reasoning, building upon previous steps
    to solve complex problems incrementally.

    Use cases:
    - Complex problem solving requiring multiple iterations
    - Mathematical proofs with multiple steps
    - Logical deductions that build upon previous conclusions
    - Iterative refinement of solutions
    """

    current_step: ThoughtStep = Field(
        default=ThoughtStep(),
        description="The current step or question to analyze",
    )
    max_tokens: int = Field(
        default=2000,
        description="The maximum number of tokens to generate",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling",
    )

    async def process(self, context: ProcessingContext) -> dict:
        # Get previous messages from context
        previous_messages = context.get(self._id, [])

        user_message = Message(
            role="user",
            content=self.current_step.instructions,
        )
        # Build message history
        messages = [
            Message(
                role="system",
                content="""
                You are an expert at iterative problem solving through chain-of-thought reasoning.
                You will be given a series of steps or questions to analyze.
                Consider all previous steps and their conclusions when formulating your response.
                
                For each step:
                1. Review previous reasoning and conclusions
                2. Analyze the current step and instructions
                3. Show your step-by-step reasoning process
                4. Create result for the current step
                
                Make sure your reasoning:
                - Builds upon previous steps when relevant
                - Explicitly references previous conclusions
                - Shows clear logical progression
                - Arrives at a specific conclusion
                """,
            ),
            *previous_messages,
            user_message,
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chain_of_thought",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "reasoning": {"type": "string"},
                            "result": {"type": "string"},
                        },
                        "required": ["reasoning", "result"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
            },
        )

        result = json.loads(str(assistant_message.content))

        # Update message history in context
        context.set(
            self._id,
            [
                *previous_messages,
                user_message,
                assistant_message,
            ],
        )

        return {
            "reasoning": result["reasoning"],
            "result": result["result"],
        }

    @classmethod
    def return_type(cls):
        return {
            "reasoning": str,
            "result": str,
        }


class ChartGenerator(BaseNode):
    """
    LLM Agent to create chart configurations based on natural language descriptions.
    llm, data visualization, charts

    Use cases:
    - Generating chart configurations from natural language descriptions
    - Creating data visualizations programmatically
    - Converting data analysis requirements into visual representations
    """

    prompt: str = Field(
        default="",
        description="Natural language description of the desired chart",
    )
    data: DataframeRef = Field(
        default=DataframeRef(),
        description="The data to visualize",
    )
    max_tokens: int = Field(
        default=1000,
        ge=0,
        le=10000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns available in the data.",
    )

    async def process(self, context: ProcessingContext) -> ChartConfig:
        system_message = Message(
            role="system",
            content="You are an assistant that helps generate chart configurations based on natural language descriptions.",
        )

        user_message = Message(
            role="user",
            content=self.prompt,
        )

        messages = [system_message, user_message]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chart_configuration",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "x_label": {"type": "string"},
                            "y_label": {"type": "string"},
                            "legend": {"type": "boolean"},
                            "data": {
                                "type": "object",
                                "properties": {
                                    "series": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "name": {"type": "string"},
                                                "x": {"type": "string"},
                                                "y": {"type": "string"},
                                                "color": {"type": "string"},
                                                "series_type": {
                                                    "type": "string",
                                                    "enum": ["line", "bar", "scatter"],
                                                },
                                                "line_style": {
                                                    "type": "string",
                                                    "enum": [
                                                        "solid",
                                                        "dashed",
                                                        "dotted",
                                                    ],
                                                },
                                                "marker": {
                                                    "type": "string",
                                                    "enum": [".", "o", "s", "d"],
                                                },
                                            },
                                            "required": [
                                                "name",
                                                "x",
                                                "y",
                                                "color",
                                                "series_type",
                                                "line_style",
                                                "marker",
                                            ],
                                            "additionalProperties": False,
                                        },
                                    }
                                },
                                "required": ["series"],
                                "additionalProperties": False,
                            },
                        },
                        "required": [
                            "title",
                            "x_label",
                            "y_label",
                            "legend",
                            "data",
                        ],
                        "additionalProperties": False,
                    },
                    "strict": True,
                },
            },
        )

        chart_config_dict = json.loads(str(assistant_message.content))
        chart_config = ChartConfig(**chart_config_dict)

        return chart_config


class RegressionAnalyst(BaseNode):
    """
    Agent that performs regression analysis on a given dataframe and provides insights.

    Use cases:
    - Performing linear regression on datasets
    - Interpreting regression results like a data scientist
    - Providing statistical summaries and insights
    """

    prompt: str = Field(
        default="",
        description="The user prompt or question regarding the data analysis.",
    )
    data: DataframeRef = Field(
        default=DataframeRef(),
        description="The dataframe to perform regression on.",
    )
    max_tokens: int = Field(
        default=1000,
        ge=0,
        le=10000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )

    async def process(self, context: ProcessingContext) -> str:
        assert self.data.data is not None, "Data is required"
        assert self.data.columns is not None, "Columns are required"

        # Convert data to pandas DataFrame
        df = pd.DataFrame(
            self.data.data, columns=[col.name for col in self.data.columns]
        )

        # First, use LLM to determine regression parameters
        columns_info = "\n".join(
            [f"- {col.name}: {col.data_type}" for col in self.data.columns]
        )
        parameter_prompt = f"""
Given the following columns in the dataset:
{columns_info}

And the user's analysis request:
{self.prompt}

Please specify:
1. Which variable should be the target (dependent) variable
2. Which variables should be used as features (independent variables)
3. Any specific regression parameters or considerations

Provide your response in JSON format.
"""

        parameter_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=[
                Message(
                    role="system",
                    content="You are an expert data scientist who helps set up regression analyses.",
                ),
                Message(role="user", content=parameter_prompt),
            ],
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "regression_parameters",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "target_variable": {"type": "string"},
                            "feature_variables": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["target_variable", "feature_variables"],
                        "additionalProperties": False,
                    },
                },
            },
        )

        regression_params = json.loads(str(parameter_message.content))
        target_variable = regression_params["target_variable"]
        feature_variables = regression_params["feature_variables"]

        # Validate variables exist in dataframe
        if target_variable not in df.columns:
            raise ValueError(f"Target variable {target_variable} not found in data")

        missing_features = [col for col in feature_variables if col not in df.columns]
        if missing_features:
            raise ValueError(f"Feature variables not found in data: {missing_features}")

        # Identify categorical columns
        categorical_columns = (
            df[feature_variables].select_dtypes(include=["object"]).columns
        )
        numeric_columns = (
            df[feature_variables].select_dtypes(exclude=["object"]).columns
        )

        # Create dummy variables for categorical columns
        X = df[numeric_columns].copy()
        if len(categorical_columns) > 0:
            X = pd.concat(
                [
                    X,
                    pd.get_dummies(
                        df[categorical_columns], drop_first=True, dtype=float
                    ),
                ],
                axis=1,
            )

        # Add constant term for intercept
        X = sm.add_constant(X)
        y = df[target_variable]

        # Perform OLS regression
        model = sm.OLS(y, X).fit()
        summary = model.summary().as_text()

        # Add information about categorical variables to the prompt
        categorical_info = ""
        if len(categorical_columns) > 0:
            categorical_info = f"""
Note: The following categorical variables were converted to dummy variables:
{', '.join(categorical_columns)}
Each categorical variable was encoded using dummy variables (one-hot encoding), with one category dropped to avoid multicollinearity.
"""

        # Prepare prompt for LLM to interpret results
        interpretation_prompt = f"""
The following is the output from an OLS regression analysis:

Target Variable: {target_variable}
Feature Variables: {', '.join(feature_variables)}

{summary}

{categorical_info}

Please provide an interpretation of these results as a data scientist would, focusing on:
1. The significance of the coefficients
2. R-squared value and model fit
3. Any potential issues or insights
4. Interpretation of dummy variables (if present)

User's original question: {self.prompt}
"""

        interpretation_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=GPTModel.GPT4Mini.value),
            messages=[
                Message(
                    role="system",
                    content="You are an expert data scientist who provides detailed interpretations of regression analysis results.",
                ),
                Message(role="user", content=interpretation_prompt),
            ],
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )

        return str(interpretation_message.content)


class SVGChartRenderer(BaseNode):
    """
    Node responsible for rendering chart configurations into SVG.
    """

    chart_config: ChartConfig = Field(
        default=ChartConfig(), description="The chart configuration to render."
    )
    width: int = Field(
        default=640,
        ge=0,
        le=10000,
        description="The width of the chart in pixels.",
    )
    height: int = Field(
        default=480,
        ge=0,
        le=10000,
        description="The height of the chart in pixels.",
    )
    data: Any = Field(
        default=None, description="The data to visualize as a pandas DataFrame."
    )

    async def process(self, context: ProcessingContext) -> SVGElement:
        if self.data is None:
            raise ValueError("Data is required for rendering the chart.")

        df = pd.DataFrame(
            self.data.data, columns=[col.name for col in self.data.columns]
        )

        fig = Figure(figsize=(self.width / 100, self.height / 100))
        ax = fig.add_subplot(111)

        for series in self.chart_config.data.series:
            x_col = series.x
            y_col = series.y
            label = series.name
            color = series.color

            data = df.copy()

            if series.series_type == "bar":
                ax.bar(data[x_col], data[y_col], label=label, color=color)
            elif series.series_type == "line":
                ax.plot(
                    data[x_col],
                    data[y_col],
                    label=label,
                    color=color,
                    linestyle=series.line_style,
                    marker=series.marker,
                )
            elif series.series_type == "scatter":
                ax.scatter(
                    data[x_col],
                    data[y_col],
                    label=label,
                    c=color,
                    marker=series.marker,
                )
            # Add other chart types as needed

        ax.set_xlabel(self.chart_config.x_label)
        ax.set_ylabel(self.chart_config.y_label)
        ax.set_title(self.chart_config.title)

        if self.chart_config.legend:
            ax.legend()

        plt.tight_layout()

        output = io.StringIO()
        FigureCanvasSVG(fig).print_svg(output)
        svg_str = output.getvalue()
        plt.close(fig)

        svg_start = svg_str.find("<svg")
        svg_end = svg_str.rfind("</svg>") + 6
        svg_content = svg_str[svg_start:svg_end]

        return SVGElement(
            name="svg",
            attributes={
                "width": str(self.width),
                "height": str(self.height),
                "xmlns": "http://www.w3.org/2000/svg",
            },
            content=svg_content,
            children=[],
        )
