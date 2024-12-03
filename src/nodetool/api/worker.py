import dotenv
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from nodetool.api.websocket_runner import WebSocketRunner

from nodetool.common.environment import Environment
from nodetool.metadata.node_metadata import NodeMetadata
from nodetool.metadata.types import ModelFile
import nodetool.nodes.anthropic
import nodetool.nodes.chroma
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama
import nodetool.nodes.luma
import nodetool.nodes.kling
from nodetool.workflows.base_node import get_registered_node_classes
from nodes import init_extra_nodes
import comfy.cli_args

comfy.cli_args.args.force_fp16 = True

init_extra_nodes()


env_file = dotenv.find_dotenv(usecwd=True)

if env_file != "":
    print(f"Loading environment from {env_file}")
    dotenv.load_dotenv(env_file)

Environment.initialize_sentry()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

env_file = dotenv.find_dotenv(usecwd=True)

if env_file != "":
    print(f"Loading environment from {env_file}")
    dotenv.load_dotenv(env_file)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    runner = WebSocketRunner()
    await runner.run(websocket)


@app.get("/metadata")
async def metadata() -> list[NodeMetadata]:
    """
    Returns a list of all node metadata.
    """
    import nodetool.nodes

    return [node_class.metadata() for node_class in get_registered_node_classes()]
