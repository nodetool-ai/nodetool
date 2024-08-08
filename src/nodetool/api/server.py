import os
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from nodetool.api import prediction
from nodetool.common.environment import Environment

from fastapi import APIRouter, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from uvicorn import run as uvicorn

from . import (
    asset,
    job,
    auth,
    message,
    node,
    storage,
    task,
    workflow,
    model,
)

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
]


def create_app(
    origins: list[str] = ["*"],
    routers: list[APIRouter] = DEFAULT_ROUTERS,
    static_folder: str | None = None,
):
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

    for router in routers:
        app.include_router(router)

    if not Environment.is_production():

        @app.exception_handler(RequestValidationError)
        async def validation_exception_handler(
            request: Request, exc: RequestValidationError
        ):
            print(f"Request validation error: {exc}")
            return JSONResponse({"detail": exc.errors()}, status_code=422)

    if Environment.get_comfy_folder():
        import comfy.cli_args

        comfy.cli_args.args.force_fp16 = True

        import comfy.model_management
        import comfy.utils
        from nodes import init_extra_nodes

        init_extra_nodes()

    @app.get("/health")
    async def health_check() -> str:
        return "OK"

    @app.websocket("/predict")
    async def websocket_endpoint(websocket: WebSocket):
        from nodetool.api.websocket_runner import WebSocketRunner

        runner = WebSocketRunner()
        await runner.run(websocket)

    if static_folder:
        app.mount("/", StaticFiles(directory=static_folder, html=True), name="static")

    return app


def run_uvicorn_server(app: str, host: str, port: int, reload: bool) -> None:
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
