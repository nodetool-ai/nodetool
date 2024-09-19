import json
import os
import logging
from datetime import datetime
from typing import Any, List
from nodetool.types.workflow import Workflow
from nodetool.types.graph import Graph
from nodetool.workflows.read_graph import read_graph

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

examples_folder = os.path.join(os.path.dirname(__file__), "examples")
examples = None


def load_example(name: str) -> Workflow:
    example_path = os.path.join(examples_folder, name)
    with open(example_path, "r") as f:
        try:
            props = json.load(f)
            return Workflow(**props)
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding JSON for example workflow {name}: {e}")
            # Return an empty Workflow with the name indicating it is broken
            now_str = datetime.now().isoformat()
            return Workflow(
                id="",
                name=f"[ERROR] {name}",
                tags=[],
                graph=Graph(nodes=[], edges=[]),
                access="",
                created_at=now_str,
                updated_at=now_str,
                description="Error loading this workflow",
            )


def load_examples() -> List[Workflow]:
    global examples
    if examples is None:
        examples = [
            load_example(name) for name in os.listdir(examples_folder) if name[0] != "_"
        ]
    return examples
