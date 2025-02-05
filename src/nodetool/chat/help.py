import asyncio
import base64
import json
import os
from typing import AsyncGenerator, Mapping
import PIL
import ollama
import readline

import chromadb

from nodetool.providers.ollama.ollama_service import get_ollama_client
from nodetool.chat.tools import Tool, sanitize_node_name
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    ImageRef,
    Message,
    MessageImageContent,
    MessageTextContent,
)
from nodetool.workflows.base_node import (
    BaseNode,
    get_node_class,
    get_registered_node_classes,
)
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.examples import load_examples
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
        embedding_function=embedding_function,  # type: ignore
    )


def index_documentation(collection: chromadb.Collection):
    """
    Index the documentation if it doesn't exist yet.
    """
    import nodetool.nodes.aime
    import nodetool.nodes.anthropic

    # import nodetool.nodes.comfy
    import nodetool.nodes.elevenlabs
    import nodetool.nodes.fal
    import nodetool.nodes.google
    import nodetool.nodes.huggingface
    import nodetool.nodes.lib
    import nodetool.nodes.nodetool
    import nodetool.nodes.ollama
    import nodetool.nodes.openai
    import nodetool.nodes.replicate

    if not Environment.is_production():
        import nodetool.nodes.chroma
        import nodetool.nodes.apple

    print("Indexing documentation")

    def doc_for(c: type[BaseNode]):
        return f"{c.get_title()}: {c.get_description()}"

    def metadata_for(c: type[BaseNode]):
        return {
            "title": c.get_title(),
            "node_type": c.get_node_type(),
            "json_schema": json.dumps(c.get_json_schema()),
        }

    classes = get_registered_node_classes()
    ids = [c.get_node_type() for c in classes]
    docs = [doc_for(c) for c in classes]
    metadata = [dict(metadata_for(c)) for c in classes]

    collection.add(ids, documents=docs, metadatas=metadata)  # type: ignore
    return collection


def index_examples(collection: chromadb.Collection):
    """
    Index the examples if they don't exist yet.
    """
    print("Indexing examples")

    examples = load_examples()
    ids = [example.id for example in examples]
    docs = [example.model_dump_json() for example in examples]

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


def search_documentation(query: str, n_results: int = 5) -> str:
    """
    Search the documentation for the given query string.

    Args:
        query: The query to search for.
        n_results: The number of results to return.

    Returns:
        A string of the documentation for the given query.
    """
    res = get_doc_collection().query(query_texts=[query], n_results=n_results)
    if len(res["ids"]) == 0 or res["documents"] is None:
        return ""

    return "\n".join(
        [
            f"""
            {res["documents"][0][i]}
            {res["metadatas"][0][i] if res["metadatas"] else ""}
            """
            for i in range(len(res["ids"][0]))
        ]
    )


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


CORE_DOCS = [
    {
        "id": "models",
        "title": "Models",
        "content": """
        Local Models:
        - Local models need a GPU or MPS to run fast, smaller models can run on CPU
        - Model files can be large, please check your disk space before downloading
        - Remote models require API keys, you can set them in the settings menu

        Remote Models:
        - Remote API Providers require an account and API keys
        - Fal.ai gives access to a wide range of image and video models
        - Replicate gives access to a wide range of models
        - OpenAI and Anthropic models give access to worlds' most powerful language models
        """,
    },
    {
        "id": "assets",
        "title": "Assets",
        "content": """
        Assets:
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
        """,
    },
    {
        "id": "workflow_basics",
        "title": "Workflow Basics",
        "content": """
        ## Creating Workflows
        - Start with an empty canvas in the workflow editor
        - Add nodes by double-clicking or using CTRL+Space
        - Connect nodes by dragging from output to input handles
        - Configure node parameters in the right panel
        - Save your workflow using the save button
        - Run workflows with the play button
        
        ## Best Practices
        - Name your nodes descriptively
        - Group related nodes together
        - Test workflows incrementally
        - Use comments to document complex parts
        - Back up important workflows
        """,
    },
    {
        "id": "keyboard_shortcuts",
        "title": "Keyboard Shortcuts",
        "content": """
        ## Essential Shortcuts
        - Node Menu: Double-click canvas or Space
        - Run Workflow: CTRL+Enter / Cmd+Enter
        - Stop Workflow: ESC
        - Save: CTRL+S / Cmd+S
        - Undo/Redo: CTRL+Z / Cmd+Z
        - Delete Node: Delete or Backspace
        - Copy/Paste: CTRL+C / CTRL+V / Cmd+C / Cmd+V
        - Select All: CTRL+A / Cmd+A
        - Copy selected nodes: Shift + C and Paste selected nodes with Shift + V
        - Select multiple Nodes: Drag area with left click, Shift + Left Click if using LMB for panning
        - Select multiple nodes: click on nodes with CTRL key or draw a rectangle around nodes
        """,
    },
    {
        "id": "troubleshooting",
        "title": "Troubleshooting",
        "content": """
        ## Common Issues
        - Check model requirements before downloading
        - Verify API keys are correctly set for remote services
        - Ensure sufficient disk space for models
        - Monitor GPU memory usage
        - Check node connections for errors
        
        ## Getting Help
        - Use the help menu (? icon)
        - Check documentation
        - Visit the community forum
        - Report bugs through GitHub
        """,
    },
]


def index_core_docs(collection: chromadb.Collection):
    collection.add(
        [doc["id"] for doc in CORE_DOCS],
        documents=[doc["content"] for doc in CORE_DOCS],
    )


def prompt_for_help(
    prompt: str,
    docs_str: str,
    examples: list[str],
    available_tutorials: list[str],
) -> str:
    return f"""
You're an AI assistant for Nodetool, a no-code AI workflow platform. 
        
NodeTool enables you to create custom AI workflows on your computer.

## Features ✨
- **Visual Editor**: 
  Create AI workflows visually without coding.
  A workflow is a graph of nodes.
  Each node has a name, type, and a set of parameters.
  Nodes can have multiple inputs and outputs.
  The node editor is a canvas that you can use to create your workflows.
  You can connect nodes by dragging from output to input handles.
  You can configure node parameters in the node itself.
  The workflow is executed by evaluating the graph from start to end.
  You can run the workflow by clicking the play button.
  Nodes can take strings, numbers, images, audio, video, and documents as input or output.
  One node is like a python function, it takes input, does something, and produces output.
  Many nodes run AI models, for example a text generation node runs a language model.
- **Local Models**: 
  Run models on your hardware.
  Nodetool's model manager can download models from Hugging Face and other sources.
  AI models need a NVidia GPU or Apple MPS to run fast.
  Nodetool offers many libraries for working with data, images, audio, video, and more.
  For example, image can be edited, audio can be transcribed, and documents can be summarized.
- **Integration with AI Platforms**:
  For more procesing power you can use remote models from OpenAI, Hugging Face, Ollama, Replicate, ElevenLabs, Google, Anthropic, and more.
- **Asset Browser**: 
  Import and manage media assets.
  The assets can be used as input or output for nodes.


## Use Cases 🎨

- 🎨 **Personal Learning Assistant**: Create chatbots that read and explain your PDFs, e-books, or academic papers
- 📝 **Note Summarization**: Extract key insights from Obsidian or Apple Notes
- 🎤 **Voice Memo to Presentation**: Convert recorded ideas into documents
- 🔧️ **Image Generation & Editing**: Create and modify images with advanced AI models
- 🎵 **Audio Processing**: Generate and edit audio content with AI assistance
- 🎬 **Video Creation**: Produce and manipulate video content using AI tools
- 🔧 **Desktop Utilities**: Access NodeTool mini-apps from your system tray
- 🗣️ **Siri Integration**: Extend Siri's capabilities with custom AI workflows
- ⚡ **Automation**: Streamline repetitive tasks with AI-powered scripts

Key Guidelines:
- **Reference Valid Nodes:** When mentioning a node, only reference existing ones. Use the format [Node Type](/help/node_type) for clarity.
- **Use Documentation Results:** Incorporate details from the documentation below to ensure your answers reflect the latest platform capabilities.
- **Answer Precisely:** Be concise, clear, and creative in your responses. Utilize ASCII diagrams if they help explain complex workflows.
- **Focus on Nodetool Features:** Emphasize the visual editor, asset management, model management, workflow execution, and keyboard shortcuts (for example, the help menu in the top right corner).
- **Technical Queries:** For deeper technical issues, advise users to visit the forum for further assistance.
- **Encourage Improvements:** Always be open to suggesting platform improvements where relevant.

REFERENCE NODES:
- Format any reference to a node as: [Node Type](/help/node_type)
- Example node link: [Text Generation](/help/huggingface.text.TextGeneration)
- DO NOT ADD http/domain to URLs.

Use following relevant documentation to answer questions, pay attention to Aode_type and properties:
{docs_str}

HOW TO ANSWER QUESTIONS:
- Explain any necessary Nodetool features
- Explain the node types and their parameters
- Do not mention any technology outside of Nodetool
- Do not recommend workflows in detail, only high level concepts
- Focus on explaining node features, not the broader context of AI
"""


import PIL.Image


async def create_message(message: Message) -> Mapping[str, str | list[str]]:
    ollama_message: dict[str, str | list[str]] = {
        "role": message.role,
    }

    if isinstance(message.content, list):
        ollama_message["content"] = "\n".join(
            content.text
            for content in message.content
            if isinstance(content, MessageTextContent)
        )
    else:
        ollama_message["content"] = str(message.content)

    return ollama_message


async def create_help_answer(
    messages: list[Message], available_tutorials: list[str]
) -> AsyncGenerator[str, None]:
    assert len(messages) > 0

    client = get_ollama_client()

    prompt = str(messages[-1].content)

    docs_str = search_documentation(prompt, 10)
    # _, examples = search_examples(prompt)

    print(docs_str)

    system_message = ollama.Message(
        role="system",
        content=prompt_for_help(
            prompt, docs_str=docs_str, examples=[], available_tutorials=[]
        ),
    )

    ollama_messages = [await create_message(m) for m in messages]

    res = await client.chat(
        model="llama3.2:1b",
        messages=[system_message] + ollama_messages,
        options={"num_ctx": 20000},
        stream=True,
    )
    async for part in res:
        yield part.message.content or ""

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


async def test_chat():
    """Simple terminal-based chat tester with readline support"""
    print("Starting chat test (type 'exit' to quit)")
    messages = []

    # Configure readline
    readline.parse_and_bind("tab: complete")
    readline.set_completer(lambda text, state: None)  # Disable default completion

    while True:
        try:
            user_input = input("\n> ")
            if user_input.lower() == "exit":
                break

            messages.append(Message(role="user", content=user_input))

            async for chunk in create_help_answer(messages, available_tutorials=[]):
                print(chunk, end="", flush=True)
            print()

        except KeyboardInterrupt:
            print("\nUse 'exit' to quit")
            continue
        except EOFError:
            break


if __name__ == "__main__":
    # index_core_docs(get_doc_collection())
    # index_documentation(get_doc_collection())
    # index_examples(get_example_collection())
    asyncio.run(test_chat())
