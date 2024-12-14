from pydantic import BaseModel


from typing import Any, Literal

from nodetool.types.job import JobUpdate
from nodetool.types.prediction import Prediction


class NodeUpdate(BaseModel):
    type: Literal["node_update"] = "node_update"
    node_id: str
    node_name: str
    status: str
    error: str | None = None
    logs: str | None = None
    result: dict[str, Any] | None = None
    properties: dict[str, Any] | None = None


class BinaryUpdate(BaseModel):
    type: Literal["binary_update"] = "binary_update"
    node_id: str
    output_name: str
    binary: bytes

    def encode(self) -> bytes:
        """
        Create an encoded message containing two null-terminated strings and PNG data.
        """
        # Encode the strings as UTF-8 and add null terminators
        encoded_node_id = self.node_id.encode("utf-8") + b"\x00"
        encoded_output_name = self.output_name.encode("utf-8") + b"\x00"

        # Combine all parts of the message
        message = encoded_node_id + encoded_output_name + self.binary

        return message


class NodeProgress(BaseModel):
    type: Literal["node_progress"] = "node_progress"
    node_id: str
    progress: int
    total: int


class Error(BaseModel):
    type: Literal["error"] = "error"
    error: str


ProcessingMessage = NodeUpdate | NodeProgress | JobUpdate | Error | Prediction
