from datetime import datetime
import json
import os

import chromadb

from nodetool.chat.chat import process_messages, process_tool_calls
from nodetool.chat.tools import Tool, sanitize_node_name
from nodetool.common.environment import Environment
from nodetool.common.get_files import get_content, get_files
from nodetool.metadata.types import FunctionModel, Message, Provider
from nodetool.models.user import User
from nodetool.models.workflow import Workflow
from nodetool.types.chat import MessageCreateRequest
from nodetool.workflows.base_node import (
    BaseNode,
    get_node_class,
    get_registered_node_classes,
)
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.examples import load_examples
from nodetool.models.message import Message as MessageModel
from jsonschema import validators


doc_folder = os.path.join(os.path.dirname(__file__), "docs")
examples = None
documentation = None

log = Environment.get_logger()


def validate_schema(schema):
    meta_schema = validators.Draft7Validator.META_SCHEMA

    # Create a validator
    validator = validators.Draft7Validator(meta_schema)

    try:
        # Validate the schema
        validator.validate(schema)
        print("The schema is valid.")
        return True
    except Exception as e:
        print(f"The schema is invalid. Error: {e}")
        return False


class AddNodeTool(Tool):
    """
    Tool for creating a new node.
    """

    def __init__(self, node_class: type[BaseNode]):
        self.node_class = node_class
        self.name = "add_node_" + sanitize_node_name(node_class.get_node_type())
        self.description = node_class.get_description()
        self.input_schema = node_class.get_json_schema()
        validate_schema(self.input_schema)

    async def process(self, context: ProcessingContext, thread_id: str, params: dict):
        params["type"] = self.node_class.get_node_type()
        return params


class WorkflowTool(Tool):
    """
    Tool for creating a new workflow.
    """

    def __init__(
        self,
        name: str,
        description: str = "Creates a new workflow.",
    ):
        super().__init__(
            name=name,
            description=description,
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "graph": {
                    "type": "object",
                    "properties": {
                        "nodes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "parent_id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "type": {"type": "string"},
                                    "data": {"type": "object"},
                                    "ui_properties": {"type": "object"},
                                },
                                "required": ["name", "type", "data"],
                            },
                        },
                        "edges": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "source": {"type": "string"},
                                    "sourceHandle": {"type": "string"},
                                    "target": {"type": "string"},
                                    "targetHandle": {"type": "string"},
                                    "ui_properties": {"type": "object"},
                                },
                                "required": [
                                    "id",
                                    "source",
                                    "target",
                                    "sourceHandle",
                                    "targetHandle",
                                ],
                            },
                        },
                    },
                    "required": ["nodes", "edges"],
                },
            },
        }

    async def process(self, context: ProcessingContext, thread_id: str, params: dict):
        """
        Create a workflow

        Args:
            context (ProcessingContext): The processing context.
            columns (Sequence[ColumnDef]): The columns of the record.
            params (dict): The parameters of the workflow.
        """
        new_nodes = []
        for node in params["graph"]["nodes"]:
            if node["type"].startswith("nodetool.nodes."):
                node["type"] = node["type"].replace("nodetool.nodes.", "")
            node["type"] = node["type"].replace("__", ".")

            node_class = get_node_class(node["type"])
            if node_class is None:
                raise ValueError(f"Unknown node type: {node['type']}")

            i = node_class(**node["data"])
            new_nodes.append(
                {
                    "id": i.id,
                    "type": i.get_node_type(),
                    "data": i.node_properties(),
                    "ui_properties": i._ui_properties,
                }
            )

        return params


def get_collection(name):
    """
    Get or create a collection with the given name.

    Args:
        context: The processing context.
        name: The name of the collection to get or create.
    """
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
    from chromadb.config import DEFAULT_DATABASE, DEFAULT_TENANT

    client = chromadb.PersistentClient(
        path="docs.chromadb",
        tenant=DEFAULT_TENANT,
        database=DEFAULT_DATABASE,
    )

    embedding_function = SentenceTransformerEmbeddingFunction()

    return client.get_or_create_collection(
        name=name,
        embedding_function=embedding_function,
    )


def index_documentation():
    """
    Index the documentation.
    """
    import nodetool.nodes.anthropic
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate
    import nodetool.nodes.stable_diffusion
    import nodetool.nodes.ollama

    ids = [c.get_node_type() for c in get_registered_node_classes()]
    docs = [c.get_description() for c in get_registered_node_classes()]

    get_collection("docs").add(ids, documents=docs)


def index_examples():
    """
    Index the examples.
    """
    examples = load_examples()
    ids = [example.id for example in examples]
    docs = [example.model_dump_json() for example in examples]

    get_collection("examples").add(ids, documents=docs)


def search_documentation(
    query: str, n_results: int = 30
) -> tuple[list[str], list[str]]:
    res = get_collection("docs").query(query_texts=[query], n_results=n_results)
    if len(res["ids"]) == 0:
        return [], []
    if res["documents"] is None:
        return [], []
    return res["ids"][0], res["documents"][0]


def search_examples(query: str, n_results: int = 3):
    res = get_collection("examples").query(query_texts=[query], n_results=n_results)
    if len(res["ids"]) == 0:
        return [], []
    if res["documents"] is None:
        return [], []
    return res["ids"][0], res["documents"][0]


def system_prompt_for(
    docs: list[str], examples: list[str], workflow: Workflow | None = None
) -> str:
    return f"""
You are an AI assistant specialized in the Nodetool platform - a 
no-code AI workflow development environment. Your purpose is to provide 
accurate, helpful information exclusively about Nodetool and its features.

Key Nodetool Features:
- Node-based interface for building AI applications without coding
- Integrates AI models for multimedia content generation/editing 
- User-friendly design with visual data flow
- Simplifies complex AI model usage

Core Functionalities:
1. Workflow Management 
2. Node Operations
3. Interface Navigation
4. Asset Management
5. Advanced Features

Workflow Management:
- Click Workflows in the top panel to browse and manage projects
- Edit the current workflow in the left panel
- Save workflows using the save button in the left panel
- Explore pre-built examples in the Workflow menu
- Run workflows with the Play Button in the bottom panel to see results. Note that some processes may take time to complete.

Open the Node Menu in three ways:
Double-click the canvas
Press CTRL+Space
Click the Nodes Button (circle icon) ik the top panel

Inside the Node Menu, read the description to learn how to browse and create nodes.

Try to hover or right-click on elements for more options:

- Buttons
- Parameters
- Node Header
- Canvas
- Node Selections
- Assets

Asset Management:
- Drag assets (from FileExplorer / Finder) onto the Asset tab on the right to import them
- Drag assets onto the canvas to create constant nodes
- Double-click on any asset in a node or inside the ASSETS panel to open it in the AssetViewer
- Right-click on any asset to open the Asset Menu for more options
- Select multiple assets by holding CTRL or SHIFT
- Move assets between folders by dragging them onto the desired folder,
- or use the right click menu for moving them into nested folders
- Search for assets by typing in the search bar
- Sort assets by clicking on the name or date buttons
- Download: select one or more assets and use the right click menu
- Delete: right click menu or X button
- Rename: right click menu or press F2 key (also works with multiple assets)

- Connect nodes to create data flows
- Compatible connections are highlighted while connecting
- Delete connections by right-clicking them
- Change node values with left-click
- Changed values appear highlighted
- Reset values to default with CTRL+Right-click
- Adjust number values by dragging horizontally or clicking

NodeTool enables seamless integration of advanced AI models, allowing the generation 
and editing of multimedia content including images, text, audio, and video - all inone workflow.

NodeTool is designed to be user-friendly, but does not hide the complexity of AI models.
It provides a visual representation of the data flow, making it easy to understand and modify.

Try some of the pre-built examples in the Workflow menu to get inspired.

Respond to queries about Nodetool nodes, workflows, and features based on 
the provided documentation. Use 1-2 clear, concise paragraphs. Provide more 
details if requested.

Calling tools is a powerful way to assist users. You can create new nodes:
You can create new nodes for users based on their requirements. Each node
represents a specific task or operation in the workflow. Ensure that the
nodes are well-defined and fulfill the user's needs.

Here's how to use it:
1. When a user requests a new node or you identify a need for one, find the 
    tool to add the node matching the user's request.
2. The tool name will be "add_node_" followed by the node name. For example
    "add_node_huggingface_StableDiffusion" or "add_node_openai_text_GPT".

Example usage:
User: "Can you create a node that generates a image?"
You: "Of course, I'll create a node for that right away." and call the tool
    "add_node_huggingface_StableDiffusion" with the necessary parameters.

Workflow Tool:
You have access to a powerful tool called "workflow_tool". This tool allows 
you to design new workflows for the user.

Here's how to use it:

1. When a user requests a new workflow or you identify an opportunity to 
   create one, design the workflow using your knowledge of Nodetool nodes 
   and their connections.

2. Structure the workflow as a JSON object with the following properties:
   - name: A descriptive name for the workflow
   - description: A brief explanation of what the workflow does
   - graph: An object containing two arrays:
     - nodes: Each node should have an id, type, data (properties), and 
              ui_properties
     - edges: Connections between nodes, each with an id, source, target, 
              sourceHandle, and targetHandle

3. Make sure all nodes are connected properly and the workflow is logically
    sound. Only use existing Nodetool nodes in the workflow.

4. Call the "workflow_tool" with this JSON object as its parameter.

This feature allows you to not only suggest workflows but actually implement 
them, greatly enhancing your ability to assist users. Be creative in 
designing workflows that solve user problems or demonstrate Nodetool 
capabilities.

Example usage:
User: "Can you create a workflow that generates an image and then applies a 
sepia filter?"
You: "Certainly! I'll create a workflow for that right away."

Then proceed to design the workflow by calling the tool with the name, description
and graph properties, including all necessary nodes and edges.

Guidelines:
- ONLY discuss Nodetool - no general info or other platforms
- Be accurate and consistent 
- Use creative, friendly language as an artist's assistant
- Visualize nodes/workflows with ASCII diagrams when helpful
- Use the workflow_tool to generate new workflows
- Don't disclose personal info or respond to inappropriate requests
- Refer technical issues to appropriate Nodetool resources
- Encourage sharing ideas for platform improvement

Your knowledge and assistance are crucial for Nodetool users. Prioritize 
their experience while maintaining the platform's integrity.

Relevant Documentation:
{docs}

Current Workflow:
{workflow.graph if workflow else "No workflow selected"}

Example Workflows:
{examples}
"""


async def create_help_answer(
    user: User, req: MessageCreateRequest, messages: list[Message]
) -> list[Message]:
    assert user.auth_token is not None
    assert len(messages) > 0

    thread_id = req.thread_id or messages[-1].thread_id or ""

    prompt = str(messages[-1].content)

    node_types, docs = search_documentation(prompt)
    _, examples = search_examples(prompt)

    system_message = Message(
        role="system",
        content=system_prompt_for(docs, examples, req.workflow),
    )
    tools: list[Tool] = [WorkflowTool("workflow_tool")]
    classes = [
        c for c in get_registered_node_classes() if c.get_node_type() in node_types
    ]

    for node_class in classes[:128]:
        try:
            if node_class.get_node_type().startswith("replicate"):
                continue
            tools.append(AddNodeTool(node_class))
        except Exception as e:
            log.error(f"Error creating node tool: {e}")
            log.exception(e)

    context = ProcessingContext(user.id, user.auth_token)
    answer = await process_messages(
        context=context,
        messages=[system_message] + messages,
        model=FunctionModel(
            # provider=Provider.Anthropic,
            # name="claude-3-5-sonnet-20240620",
            provider=Provider.OpenAI,
            name="gpt-4o",
        ),
        thread_id=thread_id,
        node_id="",
        tools=tools,
    )
    MessageModel.create(
        user_id=user.id,
        thread_id=thread_id,
        role=answer.role,
        content=answer.content,
        tool_calls=answer.tool_calls,
        created_at=datetime.now(),
    )
    if answer.tool_calls is None:
        return [answer]

    try:
        for tool_call in answer.tool_calls:
            if tool_call.name.startswith("add_node_"):
                # Tool names are not allowed to contain dots
                tool_call.name = tool_call.name.replace(".", "__")
        tool_calls = await process_tool_calls(
            context=context,
            thread_id=thread_id,
            tool_calls=answer.tool_calls,
            tools=tools,
        )
        for tool_call in tool_calls:
            MessageModel.create(
                user_id=user.id,
                thread_id=thread_id,
                role="tool",
                tool_call_id=tool_call.id,
                tool_calls=tool_calls,
                created_at=datetime.now(),
            )
        tool_messages = [
            Message(
                role="tool",
                thread_id=thread_id,
                tool_call_id=tool_call.id,
                tool_calls=tool_calls,
            )
            for tool_call in tool_calls
        ]
    except Exception as e:
        log.error(f"Error processing tool calls: {e}")
        log.exception(e)
        tool_messages = [
            Message(
                role="system",
                content=f"An error occurred: {e}",
            )
        ]

    return [answer] + tool_messages


if __name__ == "__main__":
    index_documentation()
    index_examples()
    print("Indexed documentation and examples")
