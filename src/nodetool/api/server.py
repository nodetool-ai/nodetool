import os
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from nodetool.api import prediction
from nodetool.common.environment import Environment

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from uvicorn import run as uvicorn
import asyncio

from . import (
    asset,
    job,
    auth,
    node,
    storage,
    workflow,
    model,
)

DEFAULT_ORIGINS = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:3001",
]

DEFAULT_ROUTERS = [
    asset.router,
    job.router,
    auth.router,
    node.router,
    prediction.router,
    workflow.router,
    storage.router,
    model.router,
]


def create_app(
    origins: list[str] = DEFAULT_ORIGINS,
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

    @app.get("/health")
    async def health_check() -> str:
        return "OK"

    if static_folder:
        app.mount("/", StaticFiles(directory=static_folder, html=True), name="static")

    return app


def run_uvicorn_server(app: str, host: str, port: int) -> None:
    """
    Starts api using Uvicorn with the specified configuration.

    Parameters:
    - host: The host address on which to run the Uvicorn server.
    - port: The port number on which to run the Uvicorn server.
    """
    current_dir = os.path.dirname(os.path.realpath(__file__))
    parent_dir = os.path.dirname(current_dir)
    reload = not Environment.is_production()
    uvicorn(
        app=app,
        host=host,
        port=port,
        reload=reload,
        reload_dirs=[parent_dir] if reload else None,
        reload_includes=["*.py", "*.yaml", "*.json"] if reload else None,
    )
