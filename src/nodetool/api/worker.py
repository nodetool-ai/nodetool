import dotenv
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from nodetool.api.websocket_runner import WebSocketRunner

import nodetool.nodes.anthropic
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.stable_diffusion
import nodetool.nodes.ollama


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
