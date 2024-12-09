import asyncio
import msgpack
import websockets
from typing import TypedDict, List, Dict, Any


class Node(TypedDict):
    id: str
    type: str
    data: Dict[str, Any]


class Edge(TypedDict):
    id: str
    source: str
    target: str
    sourceHandle: str
    targetHandle: str
    ui_properties: Dict[str, Any]


class Graph(TypedDict):
    nodes: List[Node]
    edges: List[Edge]


class RunJobRequest(TypedDict):
    user_id: str
    workflow_id: str
    job_type: str
    params: Dict[str, Any]
    graph: Graph


workflow: Graph = {
    "nodes": [
        {
            "id": "1",
            "type": "comfy.StableDiffusion",
            "data": {
                "model": {
                    "type": "hf.stable_diffusion",
                    "repo_id": "SG161222/Realistic_Vision_V5.1_noVAE",
                    "path": "Realistic_Vision_V5.1_fp16-no-ema.safetensors",
                },
                "prompt": "A cat dressed as a Victorian gentleman, complete with a top hat, monocle, and cane, hosting a tea party for squirrels wearing tiny waistcoats, set in a lavishly decorated 19th-century garden with absurdly oversized teacups and a confused penguin as the butler.",
                "negative_prompt": "",
                "seed": 0,
                "guidance_scale": 7,
                "num_inference_steps": 30,
                "width": 1024,
                "height": 1024,
                "scheduler": "simple",
                "sampler": "euler",
                "input_image": {
                    "type": "image",
                    "uri": "",
                    "asset_id": None,
                    "data": None,
                },
                "mask_image": {
                    "type": "image",
                    "uri": "",
                    "asset_id": None,
                    "data": None,
                },
                "grow_mask_by": 6,
                "denoise": 1,
                "loras": None,
            },
        },
    ],
    "edges": [],
}


async def run_workflow():
    uri = "ws://213.173.108.100:16114/predict"

    request: RunJobRequest = {
        "user_id": "test-user",
        "workflow_id": "test-workflow",
        "job_type": "test",
        "params": {},
        "graph": workflow,
    }

    async with websockets.connect(uri) as websocket:
        print("Connected to worker endpoint")

        await websocket.send(msgpack.packb({"command": "run_job", "data": request}))

        while True:
            try:
                message = msgpack.unpackb(await websocket.recv())
                print(message)

                if message.get("type") == "job_update":
                    print(f"Job status: {message['status']}")
                    if message["status"] == "completed":
                        print(f"Result: {message['result']}")
                        break

                elif message.get("type") == "node_update":
                    print(f"Node update: {message['node_name']} {message['status']}")
                    if message.get("error"):
                        print(f"Error: {message['error']}")

                elif message.get("type") == "node_progress":
                    progress = (message["progress"] / message["total"]) * 100
                    print(f"Node progress: {message['node_name']} {progress:.1f}%")

            except websockets.exceptions.ConnectionClosed:
                print("Connection closed")
                break


if __name__ == "__main__":
    asyncio.run(run_workflow())
