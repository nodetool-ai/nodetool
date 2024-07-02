from pydantic import BaseModel
from typing import Any, Optional


class TypeMetadata(BaseModel):
    """
    Metadata for a type.
    """

    type: str
    optional: bool = False
    values: Optional[list[str | int]] = None
    type_args: list["TypeMetadata"] = []
    type_name: Optional[str] = None

    def __repr__(self):
        return f"TypeMetadata(type={self.type}, optional={self.optional}, values={self.values}, type_args={self.type_args})"

    def is_asset_type(self):
        from nodetool.metadata.types import asset_types

        return self.type in asset_types

    def is_comfy_type(self):
        return self.type.startswith("comfy.")

    def is_enum_type(self):
        return self.type == "enum"

    def is_list_type(self):
        return self.type == "list"

    def is_union_type(self):
        return self.type == "union"

    def get_python_type(self):
        from nodetool.metadata.types import NameToType

        if self.is_enum_type():
            return NameToType[self.type_name]
        else:
            return NameToType[self.type]

    def get_json_schema(self) -> dict[str, Any]:
        """
        Returns a JSON schema for the type.
        """
        if self.type == "any":
            return {}
        if self.is_comfy_type():
            return {"type": "object", "properties": {"id": {"type": "string"}}}
        if self.is_asset_type():
            return {"type": "object", "properties": {"url": {"type": "string"}}}
        if self.type == "none":
            return {"type": "null"}
        if self.type == "int":
            return {"type": "integer"}
        if self.type == "float":
            return {"type": "number"}
        if self.type == "bool":
            return {"type": "boolean"}
        if self.type == "str":
            return {"type": "string"}
        if self.type == "text":
            return {"type": "string"}
        if self.type == "tensor":
            return {"type": "array", "items": {"type": "number"}}
        if self.type == "list":
            return {
                "type": "array",
                "items": self.type_args[0].get_json_schema(),
            }
        if self.type == "dict":
            return {
                "type": "object",
                "properties": {
                    f"key_{i}": t.get_json_schema()
                    for i, t in enumerate(self.type_args)
                },
            }
        if self.type == "union":
            return {
                "anyOf": [t.get_json_schema() for t in self.type_args],
            }
        if self.type == "enum":
            return {
                "type": "string",
                "enum": self.values,
            }
        raise ValueError(f"Unknown type: {self.type}")
