from datetime import datetime
import json
import os

from nodetool.chat.chat import process_messages, process_tool_calls
from nodetool.chat.tools import Tool
from nodetool.common.get_files import get_content
from nodetool.metadata.types import FunctionModel, Message, Provider
from nodetool.models.user import User
from nodetool.models.workflow import Workflow
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.examples import load_examples
from nodetool.models.message import Message as MessageModel


doc_folder = os.path.join(os.path.dirname(__file__), "docs")
examples = None
documentation = None


class WorkflowTool(Tool):
    """
    Tool for creating a new workflow.
    """

    description: str

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
        for node in params["graph"]["nodes"]:
            if node["type"].startswith("nodetool.nodes."):
                node["type"] = node["type"].replace("nodetool.nodes.", "")

        # workflow = Workflow.create(
        #     user_id=context.user_id,
        #     name=params["name"],
        #     description=params["description"],
        #     graph=params["graph"],
        # )
        return params


def system_prompt():
    global examples
    global documentation

    if documentation is None:
        documentation = get_content([doc_folder], [".md"])

    if examples is None:
        examples = load_examples()

    workflows = ""

    for example in examples:
        workflows += example.model_dump_json() + "\n"

    return f"""
You are Claude, an AI assistant specialized in the Nodetool platform - a 
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

Respond to queries about Nodetool nodes, workflows, and features based on 
the provided documentation. Use 1-2 clear, concise paragraphs. Provide more 
details if requested.

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

4. Call the workflow_tool with this JSON object as its parameter.

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

NODETOOL Nodes Documentation:
{documentation}

NODETOOL Example Workflows:
{workflows}
"""


async def create_help_answer(
    user: User, thread_id: str, messages: list[Message]
) -> list[Message]:
    assert user.auth_token is not None
    system_message = Message(
        role="system",
        content=system_prompt(),
    )
    tools = [WorkflowTool("workflow_tool")]
    context = ProcessingContext(user.id, user.auth_token)
    answer = await process_messages(
        context=context,
        messages=[system_message] + messages,
        model=FunctionModel(
            provider=Provider.Anthropic, name="claude-3-5-sonnet-20240620"
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

    tool_calls = await process_tool_calls(
        context=context,
        thread_id=thread_id,
        tool_calls=answer.tool_calls,
        tools=tools,
    )
    return [answer] + [
        Message(
            role="tool",
            thread_id=thread_id,
            tool_call_id=tool_call.id,
            tool_calls=tool_calls,
        )
        for tool_call in tool_calls
    ]
