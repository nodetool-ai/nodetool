from datetime import datetime
import json
import os
import ollama

import chromadb

from nodetool.chat.chat import process_messages, process_tool_calls
from nodetool.chat.tools import Tool, sanitize_node_name
from nodetool.common.environment import Environment
from nodetool.metadata.types import FunctionModel, Message, Provider
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

    async def process(self, context: ProcessingContext, params: dict):
        params["type"] = self.node_class.get_node_type()
        return params


class TutorialTool(Tool):
    """
    Tool for starting a tutorial.
    """

    def __init__(self, tutorials: list[str]):
        self.name = "start_tutorial"
        self.description = f"Start the tutorial with the given name."
        self.input_schema = {
            "type": "object",
            "properties": {
                "tutorial_name": {
                    "type": "string",
                    "description": "The name of the tutorial to start.",
                    "enum": tutorials,
                }
            },
            "required": ["tutorial_name"],
        }

    async def process(self, context: ProcessingContext, params: dict):
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

    async def process(self, context: ProcessingContext, params: dict):
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


def get_collection(name) -> chromadb.Collection:
    """
    Get or create a collection with the given name.

    Args:
        context: The processing context.
        name: The name of the collection to get or create.
    """
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction  # type: ignore
    from chromadb.config import DEFAULT_DATABASE, DEFAULT_TENANT

    log.info(f"Using collection {name} from {Environment.get_chroma_path()}")

    client = chromadb.PersistentClient(
        path=Environment.get_chroma_path(),
        tenant=DEFAULT_TENANT,
        database=DEFAULT_DATABASE,
    )

    embedding_function = SentenceTransformerEmbeddingFunction()

    return client.get_or_create_collection(
        name=name,
        embedding_function=embedding_function,
    )


def index_documentation(collection: chromadb.Collection):
    """
    Index the documentation if it doesn't exist yet.
    """
    import nodetool.nodes.anthropic
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate
    import nodetool.nodes.kling
    import nodetool.nodes.luma
    import nodetool.nodes.ollama

    print("Indexing documentation")

    ids = [c.get_node_type() for c in get_registered_node_classes()]
    docs = [c.get_description() for c in get_registered_node_classes()]

    collection.add(ids, documents=docs)
    return collection


def index_examples(collection: chromadb.Collection):
    """
    Index the examples if they don't exist yet.
    """
    print("Indexing examples")

    examples = load_examples()
    ids = [example.id for example in examples]
    docs = [example.model_dump_json() for example in examples]

    print(sorted(ids))

    collection.add(ids, documents=docs)
    print("Indexed examples")


def get_doc_collection():
    collection = get_collection("docs")
    if collection.count() == 0:
        index_documentation(collection)
    return collection


def get_example_collection():
    collection = get_collection("examples")
    if collection.count() == 0:
        index_examples(collection)
    return collection


def search_documentation(query: str, n_results: int = 5) -> tuple[list[str], list[str]]:
    """
    Search the documentation for the given query string.

    Args:
        query: The query to search for.
        n_results: The number of results to return.

    Returns:
        A tuple of the ids and documents that match the query.
    """
    res = get_doc_collection().query(query_texts=[query], n_results=n_results)
    if len(res["ids"]) == 0 or res["documents"] is None:
        return [], []
    return res["ids"][0], res["documents"][0]


def search_examples(query: str, n_results: int = 3):
    """
    Search the examples for the given query string.

    Args:
        query: The query to search for.
        n_results: The number of results to return.

    Returns:
        A tuple of the ids and documents that match the query.
    """
    res = get_example_collection().query(query_texts=[query], n_results=n_results)
    if len(res["ids"]) == 0 or res["documents"] is None:
        return [], []
    return res["ids"][0], res["documents"][0]


"""
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
    sound. Important: Only use existing Nodetool nodes in the workflow.

4. Call the "workflow_tool" with this JSON object as its parameter.

This feature allows you to not only suggest workflows but actually implement 
them, greatly enhancing your ability to assist users. Be creative in 
designing workflows that solve user problems or demonstrate Nodetool 
capabilities.

Example usage:
User: "Can you create a workflow that generates an image and then applies a 
sepia filter?"
You: "Yes, here it is:"

Then proceed to design the workflow by calling the tool with the name, description
and graph properties, including all necessary nodes and edges.
"""


def prompt_for_help(
    prompt: str,
    docs: dict[str, str],
    examples: list[str],
    available_tutorials: list[str],
) -> str:
    docs_str = "\n".join([f"{name}: {doc}" for name, doc in docs.items()])
    examples_str = "\n".join(examples)
    return f"""
You're an AI assistant for Nodetool, a no-code AI workflow platform. 

NodeTool is the ultimate platform for AI enthusiasts, innovators, and creators. 
It brings together a wide range of AI tools and models in a simple, visual interface. 
Whether you're an artist, developer, data scientist, or complete beginner, NodeTool has everything you need to power your AI projects and bring your ideas to life.

With NodeTool, you can:
- **Prototype ideas quickly**: Experiment with thousands of models in a friendly, visual interface.
- **Run models locally**: Utilize your own GPU to run large language models via Ollama and access hundreds of models via Hugging Face Transformers and Diffusers.
- **Leverage cloud services**: Outsource heavy GPU workloads to services like Replicate, OpenAI, and Anthropic for powerful model access without expensive hardware.

## Features ✨
- **Visual Editor | No-Code Development**: Create complex AI workflows visually—no coding needed! Dive into an intuitive, node-based design and let your creativity flow.
- **Seamless Integration with Leading AI Platforms**: Mix and match models from OpenAI, Hugging Face, Anthropic, Ollama, and ComfyUI for endless possibilities.
- **Model Manager**: Browse and manage your favorite models locally. Download recommended models directly from the Hugging Face Hub and run them on your GPU.
- **Asset Browser**: Easily import and manage media assets to use in your AI creations.
- **ComfyUI Integration**: Bring in ComfyUI workflows and nodes to expand your playground.
- **Multimodal Support**: Play with images, text, audio, video, and more — all in one place.
- **API Integration**: Connect your AI tools with websites or apps seamlessly.
- **Dual Model Execution Modes**:
  - **Local Execution**: Run models locally using Ollama and Hugging Face, leveraging your own hardware.
  - **Remote Execution**: Outsource processing to cloud services like Replicate, OpenAI, and Anthropic.
  
Local Models:
- Local models need a GPU to run fast, smaller models can run on CPU
- Model files can be large, please check your disk space before downloading
- Remote models require API keys, you can set them in the settings menu

Remote Models:
- Remote API Providers require an account and API keys
- Replicate gives access to a wide range of models
- OpenAI and Anthropic models give access to worlds' most powerful language models
- Luma AI and Kling are specialized providers for video models

General Interface:
- Connect nodes to create data flows
- Drag a node input or output handle to create a connection
- Compatible connections are highlighted while connecting
- Delete connections by right-clicking them
- Change node values with left-click
- Changed values appear highlighted 
- Reset values to default with CTRL + Right-click
- Adjust number values by dragging horizontally OR clicking on the value for editing

Workflow Management:
- Workflows are the heart of NodeTool, they contain the nodes and connections that define your AI workflows
- Running a workflow is like pressing play in a movie, you can run it as many times as you want
- You can cancel a running workflow by clicking the stop button in the toolbar, it may take a few seconds to cancel
- Every run may produce different results, since nodes may have random seeds
- Click Workflows in the top panel to browse and manage your projects
- Save workflows using the save button in the toolbar.
- Run workflows with the Play Button in the toolbar.
- Explore pre-built examples on the examples page.

Open the Node Menu in three ways:
- Double-click the canvas
- Press CTRL+Space
- Click the Nodes Button (circle icon) ik the top panel

Asset Management:
- Assets are either uploaded by the user or generated by nodes
- Drag images, videos, audio, text, or any other files (from FileExplorer / Finder) onto the Asset panel on the right to import them
- Drag images, videos, audio, text, or any other files onto the canvas to create constant asset nodes
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

Model Management:
- Download models from Hugging Face, Ollama, and other providers
- Manage models in the Model Manager, accessible via the button in the top right corner
- Click on "Recommended Models" in a node to download models for that node
- Check download progress in the app bar
- Delete models using the model manager

Other Keyboard Shortcuts and Tips:
important: when a user asks about shortcuts, provide the following information and suggest the help menu in the top right corner:

 Node Menu Shortcuts
 - Open Node Menu: Double click on canvas, Shift + Space, or CTRL + Space
 - Focus Search in NodeMenu: Esc or just start typing with menu opened
 
 Nodes Shortcuts
 - Node Context Menu: Right click on node name or left click on top-right menu icon
 - Copy selected nodes: Shift + C and Paste selected nodes with Shift + V
 - Select multiple Nodes: Drag area with left click, Shift + Left Click if using LMB for panning
 - Collapse / Uncollapse a Node: Double click on node name or use right click menu
 - Delete Node: Backspace or Delete when one or more nodes are selected
 - Select multiple nodes: click on nodes with CTRL key or draw a rectangle around nodes

Command Menu Shortcut
 - Open Command Menu: Alt + K, Option + K
 
Connection Menu Shortcuts
 - Open Connection Menu: Start a connecton from any output and then end the connection on the canvas
 
Create Asset Nodes (nodes that contain an asset like text file, image, audio, video)
 - Create Asset Node: Drop an asset from the Asset Menu or from the File Explorer onto the Canvas

Shortcuts:
- Node Menu: Double-click canvas, Shift/CTRL+Space
- Select/Copy/Paste Nodes: CTRL+click, Shift+C/V
- Delete: Backspace/Delete
- Command Menu: Alt/Option+K
- Undo/Redo: CTRL+Z, CTRL+Shift+Z
- Align/Arrange: A, Space+A
- Fit Screen: Alt/Option+S
- Run/Cancel Workflow: CTRL+Enter, ESC

Guidelines:
- Discuss only Nodetool
- Be concise, clear, and creative
- Use ASCII diagrams if helpful
- Refer technical issues to forum
- Encourage platform improvement ideas

Use following documentation for Node types to answer user questions:
{docs_str}

Try to reference nodes when possible:
- Format any reference to a node as: [Node Type](/help/node_type)
- Example node link: [Text Generation](/help/huggingface.text.TextGeneration)
- Do NOT invent nodes, only use existing node types
- DO NOT ADD http/domain to URLs.

Example responses:
- You can use the [StableDiffusion](/help/huggingface.text_to_image.StableDiffusion) node to generate images.
- You can use the [Text Generation](/help/huggingface.text_to_audio.TextToSpeech) node to generate speech.

Node links are clickable and will open the corresponding node documentation page.
"""


async def create_help_answer(
    messages: list[Message], available_tutorials: list[str]
) -> list[Message]:
    assert len(messages) > 0

    client = Environment.get_ollama_client()

    prompt = str(messages[-1].content)

    node_types, docs = search_documentation(prompt, 20)
    # _, examples = search_examples(prompt)

    docs_dict = dict(zip(node_types, docs))
    system_message = ollama.Message(
        role="system",
        content=prompt_for_help(
            prompt, docs=docs_dict, examples=[], available_tutorials=[]
        ),
    )

    ollama_messages = [ollama.Message(role=m.role, content=m.content) for m in messages]  # type: ignore

    completion = await client.chat(
        model="qwen2.5:1.5b",
        messages=[system_message] + ollama_messages,
        options={"num_ctx": 4096},
    )
    message = completion["message"]
    return [Message(role=message["role"], content=message["content"])]

    # system_message = Message(
    #     role="system",
    #     content=system_prompt_for(prompt, docs_dict, examples, available_tutorials),
    # )
    # tools: list[Tool] = []
    # classes = [
    #     c for c in get_registered_node_classes() if c.get_node_type() in node_types
    # ]
    # model = FunctionModel(
    #     provider=Provider.OpenAI,
    #     name="gpt-4o-mini",
    # )
    # tools.append(TutorialTool(available_tutorials))

    # for node_class in classes[:10]:
    #     try:
    #         if node_class.get_node_type().startswith("replicate"):
    #             continue
    #         tools.append(AddNodeTool(node_class))
    #     except Exception as e:
    #         log.error(f"Error creating node tool: {e}")
    #         log.exception(e)

    # context = ProcessingContext("", "notoken")
    # answer = await process_messages(
    #     context=context,
    #     messages=[system_message] + messages,
    #     model=model,
    #     node_id="",
    #     tools=tools,
    # )

    # if answer.tool_calls:
    #     answer.tool_calls = await process_tool_calls(context, answer.tool_calls, tools)

    # return [answer]


if __name__ == "__main__":
    index_documentation(get_doc_collection())
    index_examples(get_example_collection())
