import os
from typing import Any
import dotenv
import warnings
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from nodetool.api import prediction
from nodetool.api.websocket_proxy import WebSocketProxy
from nodetool.common.environment import Environment
from nodetool.chat.help import index_documentation, index_examples, get_collection

from nodetool.common.huggingface_cache import (
    websocket_endpoint as hf_websocket_endpoint,
)

from fastapi import APIRouter, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn import run as uvicorn

from . import asset, job, auth, message, node, storage, task, workflow, model, settings
import mimetypes


# FIX: Windows: mimetypes.guess_type() returns None for some files
# See:
# - https://github.com/encode/starlette/issues/829
# - https://github.com/pallets/flask/issues/1045
#
# The Python mimetypes module on Windows pulls values from the registry.
# If mimetypes.guess_type() returns None for some files, it may indicate
# that the Windows registry is corrupted or missing entries.
#
# This issue affects Windows systems and may cause problems with
# file type detection in web frameworks like Starlette or Flask.
#
# Let's add the missing mime types to the mimetypes module.
mimetypes.init()
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")
mimetypes.add_type("image/gif", ".gif")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/pdf", ".pdf")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/xml", ".xml")
mimetypes.add_type("text/plain", ".txt")

DEFAULT_ROUTERS = [
    asset.router,
    job.router,
    auth.router,
    message.router,
    node.router,
    prediction.router,
    workflow.router,
    storage.router,
    task.router,
    model.router,
    settings.router,
]


class PermissionsPolicyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Permissions-Policy"] = "microphone=self"
        return response


def create_app(
    origins: list[str] = ["*"],
    routers: list[APIRouter] = DEFAULT_ROUTERS,
    static_folder: str | None = None,
):
    env_file = dotenv.find_dotenv(usecwd=True)

    if env_file != "":
        print(f"Loading environment from {env_file}")
        dotenv.load_dotenv(env_file)

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,
    )

    # Add the PermissionsPolicyMiddleware
    app.add_middleware(PermissionsPolicyMiddleware)

    for router in routers:
        app.include_router(router)

    if not Environment.is_production():

        @app.exception_handler(RequestValidationError)
        async def validation_exception_handler(
            request: Request, exc: RequestValidationError
        ):
            print(f"Request validation error: {exc}")
            return JSONResponse({"detail": exc.errors()}, status_code=422)

    @app.get("/health")
    async def health_check() -> str:
        return "OK"

    worker_url = Environment.get_worker_url()

    # TODO: run this in a subprocess
    # if Environment.is_production():
    #     index_documentation(get_collection("docs"))
    #     index_examples(get_collection("examples"))

    if not Environment.is_production():
        app.add_websocket_route("/hf/download", hf_websocket_endpoint)

    if worker_url:
        ws_proxy = WebSocketProxy(worker_url=worker_url)

        @app.websocket("/predict")
        async def websocket_endpoint(websocket: WebSocket):
            await ws_proxy(websocket)

    else:
        # if we don't run the worker, we need to initialize nodes
        import nodetool.nodes.anthropic
        import nodetool.nodes.comfy
        import nodetool.nodes.huggingface
        import nodetool.nodes.nodetool
        import nodetool.nodes.openai
        import nodetool.nodes.replicate
        import nodetool.nodes.ollama
        import nodetool.nodes.luma
        import nodetool.nodes.kling

        if Environment.get_comfy_folder():
            import comfy.cli_args

            comfy.cli_args.args.force_fp16 = True

            import comfy.model_management
            import comfy.utils
            from nodes import init_extra_nodes

            init_extra_nodes()

        @app.websocket("/predict")
        async def websocket_endpoint(websocket: WebSocket):
            from nodetool.api.websocket_runner import WebSocketRunner

            await WebSocketRunner().run(websocket)

        @app.websocket("/chat")
        async def chat_websocket_endpoint(websocket: WebSocket):
            from nodetool.api.chat_websocket_runner import ChatWebSocketRunner

            await ChatWebSocketRunner().run(websocket)

    if static_folder and os.path.exists(static_folder):
        print(f"Mounting static folder: {static_folder}")
        app.mount("/", StaticFiles(directory=static_folder, html=True), name="static")

    return app


def run_uvicorn_server(app: Any, host: str, port: int, reload: bool) -> None:
    """
    Starts api using Uvicorn with the specified configuration.

    Args:
        app: The app to run.
        host: The host to run on.
        port: The port to run on.
        reload: Whether to reload the server on changes.
    """
    current_dir = os.path.dirname(os.path.realpath(__file__))
    parent_dir = os.path.dirname(current_dir)
    uvicorn(
        app=app,
        host=host,
        port=port,
        reload=reload,
        reload_dirs=[parent_dir] if reload else None,
        reload_includes=["*.py"] if reload else None,
    )
