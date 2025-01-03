import os
from typing import Any
import dotenv
import warnings
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from nodetool.api import collection, file, prediction
from nodetool.common.websocket_proxy import WebSocketProxy
from nodetool.common.environment import Environment

from nodetool.common.huggingface_cache import huggingface_download_endpoint
from nodetool.common.websocket_runner import WebSocketRunner
from nodetool.common.runpod_websocket_runner import RunPodWebSocketRunner
from nodetool.common.chat_websocket_runner import ChatWebSocketRunner

from fastapi import APIRouter, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn import run as uvicorn

from . import asset, job, auth, message, node, storage, task, workflow, model, settings
import mimetypes

from nodetool.common.websocket_updates import websocket_updates

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


Environment.initialize_sentry()


DEFAULT_ROUTERS = [
    asset.router,
    job.router,
    auth.router,
    message.router,
    model.router,
    node.router,
    prediction.router,
    workflow.router,
    storage.router,
    task.router,
]


if not Environment.is_production():
    DEFAULT_ROUTERS.append(file.router)
    DEFAULT_ROUTERS.append(settings.router)
    DEFAULT_ROUTERS.append(collection.router)


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
        app.add_websocket_route("/hf/download", huggingface_download_endpoint)

    if worker_url:
        predict_proxy = WebSocketProxy(worker_url=worker_url + "/predict")
        chat_proxy = WebSocketProxy(worker_url=worker_url + "/chat")

        @app.websocket("/predict")
        async def websocket_endpoint(websocket: WebSocket):
            await predict_proxy(websocket)

        @app.websocket("/chat")
        async def chat_websocket_endpoint(websocket: WebSocket):
            await chat_proxy(websocket)

    else:

        @app.websocket("/predict")
        async def websocket_endpoint(websocket: WebSocket):
            runpod_endpoint_id = os.getenv("WORKFLOW_ENDPOINT_ID")
            if runpod_endpoint_id:
                await RunPodWebSocketRunner(runpod_endpoint_id).run(websocket)
            else:
                await WebSocketRunner().run(websocket)

        @app.websocket("/chat")
        async def chat_websocket_endpoint(websocket: WebSocket):
            await ChatWebSocketRunner().run(websocket)

        @app.websocket("/updates")
        async def updates_websocket_endpoint(websocket: WebSocket):
            await websocket_updates.handle_client(websocket)

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
