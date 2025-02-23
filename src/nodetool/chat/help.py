"""
Nodetool Help System Module

This module implements the help and documentation system for Nodetool, providing:
- Documentation indexing and searching using ChromaDB for semantic search
- Example workflow indexing and retrieval
- Interactive chat-based help using LLMs
- Core documentation management

Key Components:
- Documentation indexing with semantic and keyword search capabilities
- Example workflow management and search
- Node property lookup and validation
- Interactive chat interface with tool-augmented responses

The module uses ChromaDB for vector storage and retrieval, and integrates with
Ollama for LLM-powered help responses. It supports both semantic and keyword-based
searches across documentation and examples.
"""

import asyncio
import json
import os
import re
from typing import Any, AsyncGenerator, Mapping
import ollama
import readline
from pydantic import BaseModel

import chromadb

from nodetool.common.settings import get_system_data_path
from nodetool.providers.ollama.ollama_service import get_ollama_client
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    Message,
    MessageTextContent,
)
from nodetool.workflows.base_node import (
    BaseNode,
    get_registered_node_classes,
)
from jsonschema import validators
from chromadb.api.types import IncludeEnum


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


def get_collection(name) -> chromadb.Collection:
    """
    Get or create a collection with the given name.

    Args:
        context: The processing context.
        name: The name of the collection to get or create.
    """
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction  # type: ignore
    from chromadb.config import DEFAULT_DATABASE, DEFAULT_TENANT

    chroma_path = get_system_data_path("chroma-docs")

    log.info(f"Using collection {name} from {chroma_path}")

    client = chromadb.PersistentClient(
        path=Environment.get_chroma_path(),
        tenant=DEFAULT_TENANT,
        database=DEFAULT_DATABASE,
    )

    embedding_function = SentenceTransformerEmbeddingFunction()

    return client.get_or_create_collection(
        name=name,
        embedding_function=embedding_function,  # type: ignore
        metadata={"embedding_model": "all-MiniLM-L6-v2"},
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
    from nodetool.workflows.examples import load_examples

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


class SearchResult(BaseModel):
    id: str
    content: str
    metadata: dict | None = None


def semantic_search_documentation(
    query: str,
) -> list[SearchResult]:
    """
    Perform semantic search on documentation using embeddings.

    Args:
        query: The query to search for.

    Returns:
        A list of search results from semantic matching.
    """
    n_results = 10
    collection = get_doc_collection()
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        include=[IncludeEnum.documents, IncludeEnum.distances],
    )

    search_results = []
    if results["documents"]:
        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i] if results["metadatas"] else None
            search_results.append(
                SearchResult(
                    id=results["ids"][0][i],
                    content=doc,
                    metadata=metadata,  # type: ignore
                )
            )
    return search_results


def node_properties(node_type: str) -> dict:
    """
    Get the properties of a node.
    """
    collection = get_doc_collection()
    results = collection.query(
        query_texts=[node_type],
        n_results=1,
        include=[IncludeEnum.documents, IncludeEnum.metadatas],
    )
    if results["documents"]:
        return results["metadatas"][0][0]  # type: ignore
    return {}


def keyword_search_documentation(query: str) -> list[SearchResult]:
    """
    Perform keyword search on documentation using token matching.

    Args:
        query: The query to search for.

    Returns:
        A list of search results from keyword matching.
    """
    n_results = 10
    collection = get_doc_collection()

    pattern = r"[ ,.!?\-_=|]+"
    query_tokens = [
        token.strip() for token in re.split(pattern, query) if token.strip()
    ]
    if len(query_tokens) > 1:
        where_document = {"$or": [{"$contains": token} for token in query_tokens]}
    else:
        where_document = {"$contains": query_tokens[0]}

    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where_document=where_document,  # type: ignore
        include=[IncludeEnum.documents, IncludeEnum.distances],
    )

    search_results = []
    if results["documents"]:
        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i] if results["metadatas"] else None
            search_results.append(
                SearchResult(
                    id=results["ids"][0][i],
                    content=doc,
                    metadata=metadata,  # type: ignore
                )
            )
    return search_results


def search_examples(query: str) -> list[SearchResult]:
    """
    Search the examples for the given query string.

    Args:
        query: The query to search for.
        n_results: The number of results to return.

    Returns:
        A tuple of the ids and documents that match the query.
    """
    res = get_example_collection().query(query_texts=[query], n_results=2)
    if len(res["ids"]) == 0 or res["documents"] is None:
        return []
    return [
        SearchResult(
            id=res["ids"][0][i],
            content=res["documents"][0][i],
        )
        for i in range(len(res["ids"][0]))
    ]


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


SYSTEM_PROMPT = """
You're an AI assistant for Nodetool, a no-code AI workflow platform. 
YOU ARE CONFIDENT AND KNOWLEDGEABLE.
DO NOT QUESTION YOURSELF.
        
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
  
IMPORTANT NODES:
- Preview Node: Renders any data as a preview, like images, videos, audio, documents, and more.
- Input Nodes: These nodes take user input, like text, images, audio, video, and more.
- Chat Input Node: This node takes user input from a chat interface, including audio, image or documents.
- Constant Node: This node takes a constant value as input, like a string, number, or image.
- Output Node: This node takes any data as input and displays it to the user.
- Loop Node: This node takes list or dataframes and applies a sub graph to each element of the list.
- Text Generation: There are many nodes from different providers for text generation, like OpenAI, Ollama, Google, Anthropic, and more.
- Image Generation: There are many nodes from different providers for image generation, like OpenAI, Hugging Face, Replicate, and more.

## Use Cases 🎨
- 🎨 **Personal Learning Assistant**: Create chatbots that read and explain your PDFs, e-books, or academic papers
- 📝 **Note Summarization**: Extract key insights from Obsidian or Apple Notes
- 🎤 **Voice Memo to Presentation**: Convert recorded ideas into documents
- 🔧️ **Image Generation & Editing**: Create and modify images with advanced AI models
- 🎵 **Audio Processing**: Generate and edit audio content with AI assistance
- 🎬 **Video Creation**: Produce and manipulate video content using AI tools
- ⚡ **Automation**: Streamline repetitive tasks with AI-powered scripts

Key Guidelines:
- **Reference Valid Nodes:** When mentioning a node, only reference existing ones. Use the format [Node Type](/help/node_type) for clarity.
- **Use Documentation Search:** Use the documentation search tool to find information about nodes.
- **Use Example Search:** Use the example search tool to find examples of how to use nodes.
- **Answer Precisely:** Be concise, clear, and creative in your responses. Utilize ASCII diagrams if they help explain complex workflows.
- **Focus on Nodetool Features:** Emphasize the visual editor, asset management, model management, workflow execution, and keyboard shortcuts (for example, the help menu in the top right corner).

HOW TO USE SEARCH TOOLS:

1. Semantic Search Documentation:
   - Use semantic_search_documentation() for meaning-based searches
   - Best for conceptual queries and finding related content
   - Example queries:
     - "How to generate images?" -> semantic_search_documentation("image generation")
     - "What nodes can generate text?" -> semantic_search_documentation("text generation")
   - Parameters:
     - query: str - Your search query

2. Keyword Search Documentation:
   - Use keyword_search_documentation() for exact word matches
   - Best for finding specific node types or features
   - Example queries:
     - "What is GPT?" -> keyword_search_documentation("GPT")
     - "How to use Pandas?" -> keyword_search_documentation("Pandas")
   - Parameters:
     - query: str - Your search query

3. Example Search:
   - Use search_examples() to find relevant workflow examples
   - Best for finding example workflows and use cases
   - Example queries:
     - "How to build a chatbot?" -> search_examples("chatbot")
     - "How to build a text to speech workflow?" -> search_examples("text to speech")
   - Parameters:
     - query: str - Your search query
     
4. Node Properties:
   - Use node_properties() to get the properties of a node
   - Best for finding node properties and use cases
   - Example queries:
     - "What are the inputs of the Ollama node?" -> node_properties("Ollama")
     - "What is the output of the ImagePreview node?" -> node_properties("ImagePreview")
   - Parameters:
     - node_type: str - The type of the node

When a user asks a question:
1. First try semantic search to understand the topic
2. If looking for specific nodes/features, use keyword search
3. For implementation examples, use example search
4. For details about a node, use node_properties
5. Combine the results to provide a comprehensive answer

REFERENCE NODES:
- Format any reference to a node as: [Node Type](/help/node_type)
- Example node link: [Text Generation](/help/huggingface.text.TextGeneration)
- DO NOT ADD http/domain to URLs.

HOW TO ANSWER QUESTIONS:
- Explain any necessary Nodetool features
- KEEP IT BRIEF
- DO NOT OVERTHINK
- BE CONCISE
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


available_functions = {
    "semantic_search_documentation": semantic_search_documentation,
    "keyword_search_documentation": keyword_search_documentation,
    "search_examples": search_examples,
    "node_properties": node_properties,
}


def convert_results_to_json(obj: Any) -> str:
    if isinstance(obj, BaseModel):
        return obj.model_dump_json()
    elif isinstance(obj, list):
        return json.dumps([convert_results_to_json(item) for item in obj])
    elif isinstance(obj, dict):
        return json.dumps({k: convert_results_to_json(v) for k, v in obj.items()})
    elif isinstance(obj, str):
        return obj
    elif isinstance(obj, bool):
        return str(obj).lower()
    elif isinstance(obj, int):
        return str(obj)
    elif isinstance(obj, float):
        return str(obj)
    else:
        return json.dumps(obj)


async def create_help_answer(
    messages: list[Message], model: str
) -> AsyncGenerator[str, None]:
    assert len(messages) > 0

    client = get_ollama_client()

    system_message = ollama.Message(role="system", content=SYSTEM_PROMPT)

    ollama_messages = [await create_message(m) for m in messages]
    all_messages = [system_message] + ollama_messages

    res = await client.chat(
        model=model,
        messages=all_messages,
        options={"num_ctx": 20000},
        tools=list(available_functions.values()),
        stream=True,
    )

    async for part in res:
        if part.message.tool_calls:
            # Create tasks for all tool calls
            tasks = []
            for tool in part.message.tool_calls:
                yield f"Calling tool: {tool.function.name}\n"
                if function_to_call := available_functions.get(tool.function.name):
                    task = asyncio.create_task(
                        asyncio.to_thread(function_to_call, **tool.function.arguments)
                    )
                    tasks.append((tool.function.name, task))

            # Wait for all tasks to complete
            for name, task in tasks:
                results = await task
                all_messages.append(part.message)
                all_messages.append(
                    {
                        "role": "tool",
                        "content": convert_results_to_json(results),
                        "name": name,
                    }
                )

    # Get final response with tool results
    final_res = await client.chat(
        model="llama3.2:3b",
        messages=all_messages,
        options={"num_ctx": 20000},
        stream=True,
    )
    async for chunk in final_res:
        yield chunk.message.content or ""
    else:
        yield part.message.content or ""


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

            async for chunk in create_help_answer(messages, model="llama3.2:3b"):
                print(chunk, end="", flush=True)
            print()

        except KeyboardInterrupt:
            print("\nUse 'exit' to quit")
            continue
        except EOFError:
            break


if __name__ == "__main__":
    index_core_docs(get_doc_collection())
    index_documentation(get_doc_collection())
    index_examples(get_example_collection())
    asyncio.run(test_chat())
