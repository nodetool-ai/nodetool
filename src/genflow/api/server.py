from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from genflow.common.environment import Environment

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from uvicorn import Config, Server
import asyncio
from typing import Any

from . import (
    asset,
    assistant,
    job,
    auth,
    node,
    storage,
    workflow,
    chat,
    model,
)
from genflow.models.schema import create_all_tables

DEFAULT_ORIGINS = [
    "http://localhost",
    "http://localhost:3000",
]

DEFAULT_ROUTERS = [
    asset.router,
    job.router,
    auth.router,
    node.router,
    assistant.router,
    workflow.router,
    storage.router,
    model.router,
]


def create_app(
    origins: list[str] = DEFAULT_ORIGINS, routers: list[APIRouter] = DEFAULT_ROUTERS
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

    app.websocket("/ws")(chat.websocket_endpoint)

    if not Environment.is_production():

        @app.exception_handler(RequestValidationError)
        async def validation_exception_handler(
            request: Request, exc: RequestValidationError
        ):
            print(f"Request validation error: {exc}")
            return JSONResponse(
                {"detail": exc.errors(), "body": exc.body}, status_code=422
            )

    @app.get("/")
    async def health_check() -> str:
        return "OK"

    return app


def run_uvicorn_server(app: FastAPI, host: str, port: int) -> None:
    """
    Starts api using Uvicorn with the specified configuration.

    Parameters:
    - host: The host address on which to run the Uvicorn server.
    - port: The port number on which to run the Uvicorn server.
    """
    reload = not Environment.is_production()
    config = Config(app=app, reload=reload, host=host, port=port)
    server = Server(config=config)

    # Run the server in an asyncio event loop
    asyncio.run(server.serve())
