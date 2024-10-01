import asyncio
import json
from urllib.parse import urljoin
import uuid
import aiohttp
from bs4 import BeautifulSoup
import re

from typing import Any
from pydantic import Field
from nodetool.chat.chat import (
    json_schema_for_column,
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
    RecordType,
    Task,
)
from nodetool.providers.openai.prediction import run_openai
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message


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
                thread_id=thread_id,
                task_type=task_data["type"],
                name=task_data["name"],
                instructions=task_data["instructions"],
                dependencies=task_data.get("dependencies", []),
            )
            created_tasks.append(task)

        return created_tasks


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


def extract_content(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")

    def clean_text(text: str) -> str:
        # Remove extra whitespace and newlines
        text = re.sub(r"\s+", " ", text).strip()
        return text

    # Remove script and style elements
    for script in soup(["script", "style"]):
        script.decompose()

    # Try to find the main content
    main_content = None
    potential_content_tags = [
        "article",
        "main",
        'div[id*="content"]',
        'div[class*="content"]',
    ]

    for tag in potential_content_tags:
        content = soup.select_one(tag)
        if content:
            main_content = content
            break

    # If we couldn't find a clear main content, use the body
    if not main_content:
        main_content = soup.body

    # Extract the text from the main content
    if main_content:
        # Remove common non-content elements
        for elem in main_content(["nav", "sidebar", "footer", "header"]):
            elem.decompose()

        return clean_text(main_content.get_text())
    else:
        return "No main content found"


class WebsiteContentExtractor(BaseNode):
    """
    Extract main content from a website, removing navigation, ads, and other non-essential elements.
    web scraping, content extraction, text analysis

    Use cases:
    - Clean web content for further analysis
    - Extract article text from news websites
    - Prepare web content for summarization
    """

    html_content: str = Field(
        default="",
        description="The raw HTML content of the website.",
    )

    async def process(self, context: ProcessingContext) -> str:
        return extract_content(self.html_content)


class ImageDownloader(BaseNode):
    """
    Download images from URLs in a dataframe and return a list of ImageRefs.
    image download, web scraping, data processing

    Use cases:
    - Prepare image datasets for machine learning tasks
    - Archive images from web pages
    - Process and analyze images extracted from websites
    """

    images: DataframeRef = Field(
        default=DataframeRef(),
        description="Dataframe containing image URLs and alt text.",
    )
    base_url: str = Field(
        default="",
        description="Base URL to prepend to relative image URLs.",
    )
    max_concurrent_downloads: int = Field(
        default=10,
        description="Maximum number of concurrent image downloads.",
    )

    async def download_image(
        self,
        session: aiohttp.ClientSession,
        url: str,
        context: ProcessingContext,
    ) -> ImageRef | None:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.read()
                    image_ref = await context.image_from_bytes(content)
                    return image_ref
                else:
                    print(
                        f"Failed to download image from {url}. Status code: {response.status}"
                    )
                    return None
        except Exception as e:
            print(f"Error downloading image from {url}: {str(e)}")
            return None

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        images = []

        async with aiohttp.ClientSession() as session:
            tasks = []
            assert self.images.data, "No data in the images dataframe"
            for row in self.images.data:
                src, alt, type = row
                url = urljoin(self.base_url, src)
                task = self.download_image(session, url, context)
                tasks.append(task)

                if len(tasks) >= self.max_concurrent_downloads:
                    completed = await asyncio.gather(*tasks)
                    images.extend([img for img in completed if img is not None])
                    tasks = []

            if tasks:
                completed = await asyncio.gather(*tasks)
                images.extend([img for img in completed if img is not None])

        return images
