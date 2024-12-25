from matplotlib import pyplot as plt
from matplotlib.figure import Figure
from nodetool.chat.chat import json_schema_for_dataframe, process_messages
from nodetool.metadata.types import (
    AudioRef,
    BaseType,
    ChartConfig,
    ChartConfigSchema,
    ChartData,
    DataSeries,
    DataframeRef,
    FunctionModel,
    GPTModel,
    ImageRef,
    Message,
    Provider,
    RecordType,
    SeabornEstimator,
    SeabornPlotType,
    SeabornStatistic,
)
from nodetool.nodes.nodetool.audio.synthesis import (
    Envelope,
    FM_Synthesis,
    Oscillator,
    PinkNoise,
    PitchEnvelopeCurve,
    WhiteNoise,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field

import matplotlib.pyplot as plt
import io
import pandas as pd
from matplotlib.figure import Figure

import json
import json
import uuid

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
    NodeRef,
    Provider,
    Task,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message

import statsmodels.api as sm


from enum import Enum


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
        default=4096,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for generating tasks.",
    )

    async def process_messages_with_model(
        self, messages: list[Message], context: ProcessingContext, **kwargs
    ) -> Message:
        """Helper method to process messages based on model type"""
        if self.model in [GPTModel.O1Mini, GPTModel.O1]:
            # Convert system messages to user messages
            converted_messages = []
            for msg in messages:
                if msg.role == "system":
                    converted_messages.append(
                        Message(
                            role="user",
                            content=f"Instructions: {msg.content}",
                            thread_id=msg.thread_id,
                        )
                    )
                else:
                    converted_messages.append(msg)
            return await process_messages(
                context=context,
                node_id=self._id,
                model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
                messages=converted_messages,
                **kwargs,
            )
        else:
            return await process_messages(
                context=context,
                node_id=self._id,
                model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
                messages=messages,
                **kwargs,
            )

    async def process(self, context: ProcessingContext) -> list[Task]:
        # Validate model compatibility
        if self.model in [GPTModel.O1Mini, GPTModel.O1]:
            raise ValueError(
                "O1 models do not support JSON output format. Please use GPT-4 or GPT-3.5."
            )

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

        assistant_message = await self.process_messages_with_model(
            messages=input_messages,
            context=context,
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
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for processing tasks.",
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
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
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
        default=4096,
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
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for data generation.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        # Validate model compatibility
        if self.model in [GPTModel.O1Mini, GPTModel.O1]:
            raise ValueError(
                "O1 models do not support JSON output format. Please use GPT-4 or GPT-3.5."
            )

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
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "datatable",
                    "schema": json_schema_for_dataframe(self.columns.columns),
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

    messages: list[Message] = Field(
        default=[],
        description="The messages to use in the prompt.",
    )
    max_tokens: int = Field(
        default=4096,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for chain of thought reasoning.",
    )

    @classmethod
    def return_type(cls):
        return {
            "analysis": str,
            "steps": list[ThoughtStep],
        }

    async def process(self, context: ProcessingContext) -> dict:
        # Validate model compatibility
        if self.model in [GPTModel.O1Mini, GPTModel.O1]:
            raise ValueError(
                "O1 models do not support JSON output format. Please use GPT-4 or GPT-3.5."
            )

        input_messages = [
            Message(
                role="system",
                content="""
                You are an expert at breaking down complex problems into clear steps.
                For any given problem:
                1. First analyze and understand the key components
                2. Break down the solution into logical steps
                3. Give instructions for each step
                4. Don't overthink the problem, just break it down into clear steps
                5. Minimize the number of steps
                
                Provide your response in a structured JSON format with:
                - analysis: Initial problem analysis
                - steps: Array of reasoning steps
                """,
            ),
            *self.messages,
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
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


class ProcessThought(BaseNode):
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
        default=4096,
        description="The maximum number of tokens to generate",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling",
    )
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for processing chain of thought steps.",
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
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
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

    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for chart generation.",
    )
    prompt: str = Field(
        default="",
        description="Natural language description of the desired chart",
    )
    data: DataframeRef = Field(
        default=DataframeRef(),
        description="The data to visualize",
    )
    max_tokens: int = Field(
        default=4096,
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
            content="""You are an expert data visualization assistant that helps generate chart configurations.
            Analyze the data and user's request to create the most appropriate visualization.
            Consider the data types and relationships when choosing plot types.
            You can create complex visualizations using multiple series and facets.""",
        )

        if self.data.columns is None:
            raise ValueError("No columns defined in the data")

        user_message = Message(
            role="user",
            content=f"""Available columns in the dataset:
            {json.dumps([c.model_dump() for c in self.data.columns], indent=2)}
            
            User request: {self.prompt}
            
            Create a chart configuration that best visualizes this data.
            Guidelines for Creating Effective Seaborn Charts:

	1.	Chart Purpose & Data:
	•	Analyze user request to determine visualization goal (trends, distributions, correlations)
	•	Validate data types match intended visualization
	•	Ensure column names from schema are used correctly
	
	2.	Chart Configuration:
	•	Select optimal chart type based on data and goal:
	  - lineplot: time series, continuous trends
	  - barplot/countplot: categorical data
	  - scatterplot: numerical relationships
	  - boxplot/violinplot: distributions
	  - heatmap: correlations, matrices
	
	3.	Series Configuration:
	•	Configure each DataSeries with appropriate:
	  - x/y columns
	  - plot_type
	  - visual encodings (hue, size, style)
	•	Use minimal encodings needed for clarity
	
	4.	Chart Parameters:
	•	Set clear title and axis labels
	•	Configure scales (linear/log) based on data distribution
	•	Use colorblind-friendly palettes
	•	Position legend optimally
	•	Add annotations only if essential
	
	5.	Faceting (if needed):
	•	Use row/col/col_wrap for multi-plot layouts
	•	Keep facet count reasonable
	•	Ensure adequate plot sizes
            
            Reference the columns by their names above.
            """,
        )

        messages = [system_message, user_message]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chart_config",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "x_label": {"type": "string"},
                            "y_label": {"type": "string"},
                            "legend": {"type": "boolean", "default": True},
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
                                                "y": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "hue": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "size": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "style": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "weight": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "color": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "plot_type": {
                                                    "type": "string",
                                                    "enum": [
                                                        e.value for e in SeabornPlotType
                                                    ],
                                                },
                                                "estimator": {
                                                    "type": "string",
                                                    "enum": [
                                                        e.value
                                                        for e in SeabornEstimator
                                                    ],
                                                    "nullable": True,
                                                },
                                                "ci": {
                                                    "type": "number",
                                                    "nullable": True,
                                                },
                                                "n_boot": {
                                                    "type": "integer",
                                                    "default": 1000,
                                                },
                                                "units": {
                                                    "type": "string",
                                                    "nullable": True,
                                                },
                                                "seed": {
                                                    "type": "integer",
                                                    "nullable": True,
                                                },
                                                "stat": {
                                                    "type": "string",
                                                    "enum": [
                                                        e.value
                                                        for e in SeabornStatistic
                                                    ],
                                                    "nullable": True,
                                                },
                                                "bins": {
                                                    "oneOf": [
                                                        {"type": "integer"},
                                                        {"type": "string"},
                                                    ],
                                                    "nullable": True,
                                                },
                                                "binwidth": {
                                                    "type": "number",
                                                    "nullable": True,
                                                },
                                                "binrange": {
                                                    "type": "array",
                                                    "items": {"type": "number"},
                                                    "minItems": 2,
                                                    "maxItems": 2,
                                                    "nullable": True,
                                                },
                                                "discrete": {
                                                    "type": "boolean",
                                                    "nullable": True,
                                                },
                                                "line_style": {
                                                    "type": "string",
                                                    "default": "solid",
                                                },
                                                "marker": {
                                                    "type": "string",
                                                    "default": ".",
                                                },
                                                "alpha": {
                                                    "type": "number",
                                                    "default": 1.0,
                                                },
                                                "orient": {
                                                    "type": "string",
                                                    "enum": ["v", "h"],
                                                    "nullable": True,
                                                },
                                            },
                                            "required": ["name", "x", "plot_type"],
                                        },
                                    },
                                    "row": {"type": "string", "nullable": True},
                                    "col": {"type": "string", "nullable": True},
                                    "col_wrap": {"type": "integer", "nullable": True},
                                },
                                "required": ["series"],
                            },
                            "height": {"type": "number", "nullable": True},
                            "aspect": {"type": "number", "nullable": True},
                            "x_lim": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2,
                                "nullable": True,
                            },
                            "y_lim": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2,
                                "nullable": True,
                            },
                            "x_scale": {
                                "type": "string",
                                "enum": ["linear", "log"],
                                "nullable": True,
                            },
                            "y_scale": {
                                "type": "string",
                                "enum": ["linear", "log"],
                                "nullable": True,
                            },
                            "legend_position": {
                                "type": "string",
                                "enum": ["auto", "right", "left", "top", "bottom"],
                                "default": "auto",
                            },
                            "palette": {"type": "string", "nullable": True},
                            "hue_order": {
                                "type": "array",
                                "items": {"type": "string"},
                                "nullable": True,
                            },
                            "hue_norm": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2,
                                "nullable": True,
                            },
                            "sizes": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2,
                                "nullable": True,
                            },
                            "size_order": {
                                "type": "array",
                                "items": {"type": "string"},
                                "nullable": True,
                            },
                            "size_norm": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2,
                                "nullable": True,
                            },
                            "marginal_kws": {"type": "object", "nullable": True},
                            "joint_kws": {"type": "object", "nullable": True},
                            "diag_kind": {
                                "type": "string",
                                "enum": ["auto", "hist", "kde"],
                                "nullable": True,
                            },
                            "corner": {"type": "boolean", "default": False},
                            "center": {"type": "number", "nullable": True},
                            "vmin": {"type": "number", "nullable": True},
                            "vmax": {"type": "number", "nullable": True},
                            "cmap": {"type": "string", "nullable": True},
                            "annot": {"type": "boolean", "default": False},
                            "fmt": {"type": "string", "default": ".2g"},
                            "square": {"type": "boolean", "default": False},
                        },
                        "required": ["title", "x_label", "y_label", "data"],
                    },
                },
            },
        )

        # Parse the response into our schema
        chart_config_dict = json.loads(str(assistant_message.content))

        # Validate and create instance using Pydantic
        validated_config = ChartConfigSchema(**chart_config_dict)

        # Convert to ChartConfig
        chart_data = ChartData(
            series=[
                DataSeries(**series.model_dump())
                for series in validated_config.data.series
            ],
            row=validated_config.data.row,
            col=validated_config.data.col,
            col_wrap=validated_config.data.col_wrap,
        )

        return ChartConfig(
            title=validated_config.title,
            x_label=validated_config.x_label,
            y_label=validated_config.y_label,
            legend=validated_config.legend,
            legend_position=validated_config.legend_position,
            height=validated_config.height,
            aspect=validated_config.aspect,
            x_scale=validated_config.x_scale,
            y_scale=validated_config.y_scale,
            x_lim=validated_config.x_lim,
            y_lim=validated_config.y_lim,
            palette=validated_config.palette,
            hue_order=validated_config.hue_order,
            hue_norm=validated_config.hue_norm,
            sizes=validated_config.sizes,
            size_order=validated_config.size_order,
            size_norm=validated_config.size_norm,
            marginal_kws=validated_config.marginal_kws,
            joint_kws=validated_config.joint_kws,
            diag_kind=validated_config.diag_kind,
            corner=validated_config.corner,
            center=validated_config.center,
            vmin=validated_config.vmin,
            vmax=validated_config.vmax,
            cmap=validated_config.cmap,
            annot=validated_config.annot,
            fmt=validated_config.fmt,
            square=validated_config.square,
            data=chart_data,
        )


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
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for regression analysis.",
    )

    async def process(self, context: ProcessingContext) -> str:
        assert self.data.data is not None, "Data is required"
        assert self.data.columns is not None, "Columns are required"

        # Convert data to pandas DataFrame
        df = pd.DataFrame(
            self.data.data, columns=[col.name for col in self.data.columns]
        )

        # First, use LLM to determine regression parameters
        parameter_prompt = f"""
Given the following columns in the dataset:
{[col.model_dump() for col in self.data.columns]}

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
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
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
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
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


class SynthesizerAgent(BaseNode):
    """
    Agent that interprets natural language descriptions to create sounds using basic synthesis algorithms.
    llm, audio synthesis, sound design

    Use cases:
    - Creating sounds from text descriptions
    - Automated sound design
    - Converting musical ideas into synthesized audio
    """

    prompt: str = Field(
        default="",
        description="Natural language description of the desired sound",
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
    duration: float = Field(
        default=1.0,
        ge=0.0,
        le=30.0,
        description="Duration of the sound in seconds.",
    )
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for sound synthesis.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        messages = [
            Message(
                role="system",
                content="""You are an expert sound designer who creates synthesis parameters based on text descriptions.
                Convert the description into specific synthesis parameters including:
                - Base waveform type (sine, square, sawtooth, triangle)
                - Frequency modulation parameters if needed
                - Envelope settings (ADR)
                - Noise components if needed
                
                Provide your response in a structured JSON format.""",
            ),
            Message(
                role="user",
                content=self.prompt,
            ),
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "synthesis_parameters",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "base_oscillator": {
                                "type": "object",
                                "properties": {
                                    "waveform": {
                                        "type": "string",
                                        "enum": [
                                            "sine",
                                            "square",
                                            "sawtooth",
                                            "triangle",
                                        ],
                                    },
                                    "frequency": {
                                        "type": "number",
                                        "minimum": 20,
                                        "maximum": 20000,
                                    },
                                    "amplitude": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 1,
                                    },
                                    "pitch_envelope": {
                                        "type": "object",
                                        "properties": {
                                            "amount": {
                                                "type": "number",
                                                "minimum": -24,
                                                "maximum": 24,
                                                "description": "Pitch envelope amount in semitones",
                                            },
                                            "time": {
                                                "type": "number",
                                                "minimum": 0,
                                                "maximum": 10,
                                                "description": "Pitch envelope duration in seconds",
                                            },
                                            "curve": {
                                                "type": "string",
                                                "enum": ["linear", "exponential"],
                                                "description": "Shape of the pitch envelope",
                                            },
                                        },
                                        "required": ["amount", "time", "curve"],
                                    },
                                },
                                "required": [
                                    "waveform",
                                    "frequency",
                                    "amplitude",
                                    "pitch_envelope",
                                ],
                            },
                            "fm_synthesis": {
                                "type": "object",
                                "properties": {
                                    "enabled": {"type": "boolean"},
                                    "modulator_freq": {
                                        "type": "number",
                                        "minimum": 1,
                                        "maximum": 20000,
                                    },
                                    "modulation_index": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 100,
                                    },
                                },
                                "required": [
                                    "enabled",
                                    "modulator_freq",
                                    "modulation_index",
                                ],
                            },
                            "envelope": {
                                "type": "object",
                                "properties": {
                                    "attack": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 5,
                                    },
                                    "decay": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 5,
                                    },
                                    "release": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 5,
                                    },
                                },
                                "required": ["attack", "decay", "sustain", "release"],
                            },
                            "noise": {
                                "type": "object",
                                "properties": {
                                    "type": {
                                        "type": "string",
                                        "enum": ["none", "white", "pink"],
                                    },
                                    "amplitude": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 1,
                                    },
                                },
                                "required": ["type", "amplitude"],
                            },
                        },
                        "required": [
                            "base_oscillator",
                            "fm_synthesis",
                            "envelope",
                            "noise",
                        ],
                    },
                },
            },
        )

        params = json.loads(str(assistant_message.content))

        # Create base oscillator
        if params["fm_synthesis"]["enabled"]:
            # Use FM synthesis
            synth = FM_Synthesis(
                carrier_freq=params["base_oscillator"]["frequency"],
                modulator_freq=params["fm_synthesis"]["modulator_freq"],
                modulation_index=params["fm_synthesis"]["modulation_index"],
                amplitude=params["base_oscillator"]["amplitude"],
                duration=self.duration,
            )
        else:
            # Use basic oscillator
            synth = Oscillator(
                waveform=params["base_oscillator"]["waveform"],
                frequency=params["base_oscillator"]["frequency"],
                amplitude=params["base_oscillator"]["amplitude"],
                duration=self.duration,
                pitch_envelope_amount=params["base_oscillator"]["pitch_envelope"][
                    "amount"
                ],
                pitch_envelope_time=params["base_oscillator"]["pitch_envelope"]["time"],
                pitch_envelope_curve=PitchEnvelopeCurve(
                    params["base_oscillator"]["pitch_envelope"]["curve"]
                ),
            )

        # Generate base sound
        audio = await synth.process(context)

        # Add noise if specified
        if params["noise"]["type"] != "none" and params["noise"]["amplitude"] > 0:
            noise_gen = (
                WhiteNoise if params["noise"]["type"] == "white" else PinkNoise
            )(amplitude=params["noise"]["amplitude"], duration=self.duration)
            noise_audio = await noise_gen.process(context)
            # Mix noise with base sound (would need to implement audio mixing)
            # For now, we'll just use the base sound

        # Apply envelope
        envelope = Envelope(
            audio=audio,
            attack=params["envelope"]["attack"],
            decay=params["envelope"]["decay"],
            release=params["envelope"]["release"],
        )

        return await envelope.process(context)


class ChainOfThoughtSummarizer(BaseNode):
    """
    Agent node that synthesizes the results from a chain of thought reasoning process
    into a final, coherent conclusion.

    Use cases:
    - Summarizing multi-step reasoning processes
    - Drawing final conclusions from step-by-step analysis
    - Validating logical consistency across steps
    - Generating executive summaries of complex reasoning
    """

    steps: list[ThoughtStep] = Field(
        default_factory=list,
        description="The completed chain of thought steps with their results",
    )
    messages: list[Message] = Field(
        default_factory=list,
        description="The messages used to generate the chain of thought steps",
    )
    max_tokens: int = Field(
        default=1000,
        description="The maximum number of tokens to generate",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling",
    )
    model: GPTModel = Field(
        default=GPTModel.GPT4Mini,
        description="The GPT model to use for summarizing chain of thought results.",
    )

    async def process(self, context: ProcessingContext) -> dict:
        # Validate model compatibility
        if self.model in [GPTModel.O1Mini, GPTModel.O1]:
            raise ValueError(
                "O1 models do not support JSON output format. Please use GPT-4 or GPT-3.5."
            )

        messages = [
            Message(
                role="system",
                content="""You are an expert at synthesizing multi-step reasoning processes into clear, 
                coherent conclusions. Analyze the chain of thought steps and their results to:
                1. Validate the logical consistency between steps
                2. Identify key insights from each step
                3. Write a final answer that synthesizes the key insights into a coherent conclusion
                4. Highlight all assumptions made in the steps
                
                The final answer should be a concise and clear response that addresses the original question or problem.
                The final answer should include all details from the steps and any additional context or information needed to understand the final answer.
                The final answer is suitable for a chat.
                """,
            ),
            *self.messages,
            Message(
                role="user",
                content=f"""
As a chain of thought agent, you have processed the following steps:
{json.dumps([step.model_dump() for step in self.steps], indent=2)}

Extract the key insights and result from each step and synthesize them into a final conclusion.
""",
            ),
        ]

        assistant_message = await process_messages(
            context=context,
            node_id=self._id,
            model=FunctionModel(provider=Provider.OpenAI, name=self.model.value),
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "conclusion",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "logical_consistency": {
                                "type": "boolean",
                                "description": "Whether the chain of reasoning is logically consistent",
                            },
                            "consistency_issues": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Any logical inconsistencies or issues found",
                            },
                            "final_answer": {"type": "string"},
                            "assumptions": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "logical_consistency",
                            "consistency_issues",
                            "final_answer",
                            "assumptions",
                        ],
                    },
                },
            },
        )

        return json.loads(str(assistant_message.content))

    @classmethod
    def return_type(cls):
        return {
            "logical_consistency": bool,
            "consistency_issues": list[str],
            "final_answer": str,
            "assumptions": list[str],
        }
