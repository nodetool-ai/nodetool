import json
import os
import sys
from typing import Dict, Any

from nodetool.workflows.read_graph import read_graph
from nodetool.workflows.examples import examples_folder
import nodetool.nodes.anthropic
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.stable_diffusion
import nodetool.nodes.ollama


def convert(workflow_file: str) -> None:
    with open(workflow_file, "r") as f:
        workflow_json = json.load(f)

    print(workflow_json)

    if not "edges" in workflow_json["graph"]:
        edges, nodes = read_graph(workflow_json["graph"])
        workflow_json["graph"] = {
            "edges": [edge.model_dump() for edge in edges],
            "nodes": [node.model_dump() for node in nodes],
        }

    with open(workflow_file, "w") as f:
        json.dump(workflow_json, f, indent=2)

    print(f"Converted {workflow_file} to the new format.")


if __name__ == "__main__":
    for example in os.listdir(examples_folder):
        if example[0] == "_":
            continue
        convert(os.path.join(examples_folder, example))
