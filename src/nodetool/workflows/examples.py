from datetime import datetime
import json
import os
from typing import Any
from nodetool.api.types.workflow import Workflow
from nodetool.api.types.graph import Graph
from nodetool.workflows.read_graph import read_graph

examples_folder = os.path.join(os.path.dirname(__file__), "examples")


def load_example(name: str) -> Graph:
    with open(os.path.join(examples_folder, f"{name}.json"), "r") as f:
        data = json.load(f)
        edges, nodes = read_graph(data)
        return Graph(nodes=nodes, edges=edges)


def get_examples() -> list[Workflow]:
    return []


def get_comfy_examples() -> list[Workflow]:
    """keep this for comfy launch"""
    return [
        Workflow(
            id="stable_diffusion",
            access="private",
            created_at="2021-01-01T00:00:00",
            updated_at="2021-01-01T00:00:00",
            name="Stable Diffusion",
            description="A basic Comfy workflow for generating photo-realistic images",
            thumbnail_url="/examples/sd.png",
            graph=load_example("stable_diffusion"),
        ),
        Workflow(
            id="realesrgan_x2",
            access="private",
            created_at="2021-01-01T00:00:00",
            updated_at="2021-01-01T00:00:00",
            name="Real-ESRGAN",
            description="Comfy workflow for enhancing images using Real-ESRGAN",
            thumbnail_url="/examples/real_esrgan.jpeg",
            graph=load_example("realesrgan_x2"),
        ),
        Workflow(
            id="lora",
            access="private",
            created_at="2021-01-01T00:00:00",
            updated_at="2021-01-01T00:00:00",
            name="LoRA",
            description="Comfy workflow for applying LORAs to models",
            thumbnail_url="/examples/lora.png",
            graph=load_example("lora"),
        ),
        Workflow(
            id="ipadapter_15",
            access="private",
            created_at="2021-01-01T00:00:00",
            updated_at="2021-01-01T00:00:00",
            name="IPAdapter",
            description="Comfy workflow for applying IPAdapter to models",
            thumbnail_url="/examples/ip_adapter.png",
            graph=load_example("ipadapter_15"),
        ),
    ]
