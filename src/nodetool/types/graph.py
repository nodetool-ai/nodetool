from pydantic import BaseModel


from typing import Any, List


class Node(BaseModel):
    id: str
    parent_id: str | None = None
    type: str = "default"
    data: Any = {}
    ui_properties: Any = {}


class Edge(BaseModel):
    id: str | None = None
    source: str
    sourceHandle: str
    target: str
    targetHandle: str
    ui_properties: dict[str, str] | None = None


class Graph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


def remove_connected_slots(graph: Graph) -> Graph:
    """
    Clears specific slots in the data field of nodes based on connected target handles.

    Args:
        graph (Graph): The graph object containing nodes and edges.

    Returns:
        Graph: The updated graph object with cleared slots.

    """

    # Create a dictionary to store nodes and their connected target handles
    nodes_with_incoming_edges = {}

    # Populate the dictionary
    for edge in graph.edges:
        if edge.target not in nodes_with_incoming_edges:
            nodes_with_incoming_edges[edge.target] = set()
        nodes_with_incoming_edges[edge.target].add(edge.targetHandle)

    # Clear specific slots in the data field of nodes based on connected target handles
    for node in graph.nodes:
        if node.id in nodes_with_incoming_edges:
            connected_handles = nodes_with_incoming_edges[node.id]

            for slot in connected_handles:
                if slot in node.data:
                    del node.data[slot]

    return graph


def get_input_schema(graph: Graph):
    input_schema = {"type": "object", "properties": {}, "required": []}

    for node in graph.nodes:
        if node.type.startswith("nodetool.input."):
            input_type = node.type.split(".")[-1]
            node_schema = {}

            if input_type == "FloatInput":
                node_schema = {
                    "type": "number",
                    "minimum": node.data.get("min", 0),
                    "maximum": node.data.get("max", 100),
                    "default": node.data.get("value", 0),
                }
            elif input_type == "IntegerInput":
                node_schema = {
                    "type": "integer",
                    "minimum": node.data.get("min", 0),
                    "maximum": node.data.get("max", 100),
                    "default": node.data.get("value", 0),
                }
            elif input_type in ["StringInput", "ChatInput"]:
                node_schema = {
                    "type": "string",
                    "default": node.data.get("value", ""),
                }
            elif input_type == "BooleanInput":
                node_schema = {
                    "type": "boolean",
                    "default": node.data.get("value", False),
                }
            elif input_type in ["ImageInput", "VideoInput", "AudioInput"]:
                node_schema = {
                    "type": "object",
                    "properties": {
                        "uri": {"type": "string", "format": "uri"},
                        "type": {
                            "type": "string",
                            "enum": [input_type.lower().replace("input", "")],
                        },
                    },
                    "required": ["uri", "type"],
                }

            if node_schema:
                name = node.data.get("name", node.id)
                input_schema["properties"][name] = node_schema
                input_schema["required"].append(name)

    return input_schema


def get_output_schema(graph: Graph):
    output_schema = {"type": "object", "properties": {}, "required": []}

    for node in graph.nodes:
        if node.type.startswith("nodetool.output."):
            output_type = node.type.split(".")[-1]
            node_schema = {}

            if output_type == "ListOutput":
                node_schema = {"type": "array", "items": {"type": "object"}}
            elif output_type == "ImageListOutput":
                node_schema = {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "uri": {"type": "string", "format": "uri"},
                            "type": {"type": "string", "const": "image"},
                        },
                        "required": ["uri", "type"],
                    },
                }
            elif output_type in ["IntegerOutput", "FloatOutput"]:
                node_schema = {"type": "number"}
            elif output_type == "BooleanOutput":
                node_schema = {"type": "boolean"}
            elif output_type in ["StringOutput", "TextOutput"]:
                node_schema = {"type": "string"}
            elif output_type in ["ImageOutput", "VideoOutput", "AudioOutput"]:
                node_schema = {
                    "type": "object",
                    "properties": {
                        "uri": {"type": "string", "format": "uri"},
                        "type": {
                            "type": "string",
                            "const": output_type.lower().replace("output", ""),
                        },
                    },
                    "required": ["uri", "type"],
                }
            elif output_type == "TensorOutput":
                node_schema = {"type": "array", "items": {"type": "number"}}
            elif output_type == "DataframeOutput":
                node_schema = {
                    "type": "object",
                    "properties": {
                        "columns": {"type": "array", "items": {"type": "string"}},
                        "data": {
                            "type": "array",
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": ["string", "number", "boolean", "null"]
                                },
                            },
                        },
                    },
                    "required": ["columns", "data"],
                }
            elif output_type == "DictionaryOutput":
                node_schema = {"type": "object", "additionalProperties": True}

            if node_schema:
                name = node.data.get("name", node.id)
                output_schema["properties"][name] = node_schema
                output_schema["required"].append(name)

    return output_schema
