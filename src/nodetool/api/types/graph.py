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
