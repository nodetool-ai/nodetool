from datetime import datetime
import json
import os
from typing import Any
from nodetool.types.workflow import Workflow
from nodetool.types.graph import Graph
from nodetool.workflows.read_graph import read_graph

examples_folder = os.path.join(os.path.dirname(__file__), "examples")
examples = None


def load_example(name: str) -> Workflow:
    with open(os.path.join(examples_folder, name), "r") as f:
        props = json.loads(f.read())
        return Workflow(**props)


def get_examples() -> list[Workflow]:
    global examples
    if examples is None:
        examples = [
            load_example(name) for name in os.listdir(examples_folder) if name[0] != "_"
        ]
    return examples
