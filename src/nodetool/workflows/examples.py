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


def find_example(id: str) -> Workflow | None:
    examples = load_examples()
    return next((example for example in examples if example.id == id), None)


def save_example(id: str, workflow: Workflow) -> Workflow:
    example = find_example(id)
    workflow_dict = workflow.model_dump()

    # Remove unnecessary fields
    workflow_dict.pop("user_id", None)

    example_path = os.path.join(examples_folder, f"{workflow.name}.json")
    with open(example_path, "w") as f:
        json.dump(workflow_dict, f, indent=2)

    # Invalidate the cached examples
    global examples
    examples = None

    return workflow
