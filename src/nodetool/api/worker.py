import re
import dotenv
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from nodetool.api.model import RepoPath
from nodetool.common.huggingface_file import (
    HFFileInfo,
    HFFileRequest,
    get_huggingface_file_infos,
)
from nodetool.common.huggingface_cache import try_to_load_from_cache
from nodetool.common.system_stats import get_system_stats, SystemStats
from nodetool.common.websocket_runner import WebSocketRunner
from nodetool.common.chat_websocket_runner import ChatWebSocketRunner

from nodetool.common.environment import Environment
from nodetool.common.huggingface_cache import huggingface_download_endpoint
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_hf_model,
    read_cached_hf_models,
)
from nodetool.workflows.base_node import get_recommended_models
from nodetool.metadata.node_metadata import NodeMetadata
from nodetool.metadata.types import HuggingFaceModel
import nodetool.nodes.aime
import nodetool.nodes.anthropic
import nodetool.nodes.chroma
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama
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


@app.websocket("/predict")
async def predict_websocket_endpoint(websocket: WebSocket):
    await WebSocketRunner().run(websocket)


@app.websocket("/chat")
async def chat_websocket_endpoint(websocket: WebSocket):
    await ChatWebSocketRunner().run(websocket)


@app.websocket("/download")
async def download(websocket: WebSocket):
    await huggingface_download_endpoint(websocket)


@app.get("/system_stats")
async def system_stats() -> SystemStats:
    return get_system_stats()


def flatten_models(models: dict[str, list[HuggingFaceModel]]) -> list[HuggingFaceModel]:
    return [model for models in models.values() for model in models]


@app.get("/recommended_models")
async def recommended_models() -> list[HuggingFaceModel]:
    return flatten_models(get_recommended_models())


@app.get("/huggingface_models")
async def get_huggingface_models() -> list[CachedModel]:
    return await read_cached_hf_models()


@app.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    return delete_cached_hf_model(repo_id)


@app.post("/huggingface_file_info")
async def get_huggingface_file_info(
    requests: list[HFFileRequest],
) -> list[HFFileInfo]:
    return get_huggingface_file_infos(requests)


@app.post("/huggingface/try_cache_files")
async def try_cache_files(
    paths: list[RepoPath],
) -> list[RepoPath]:
    def check_path(path: RepoPath) -> bool:
        return try_to_load_from_cache(path.repo_id, path.path) is not None

    return [
        RepoPath(repo_id=path.repo_id, path=path.path, downloaded=check_path(path))
        for path in paths
    ]


@app.get("/metadata")
async def metadata() -> list[NodeMetadata]:
    """
    Returns a list of all node metadata.
    """
    import nodetool.nodes

    return [node_class.metadata() for node_class in get_registered_node_classes()]
