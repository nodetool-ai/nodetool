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
    
    def is_cacheable_type(self):
        if self.is_list_type() or self.is_union_type() or self.is_dict_type():
            return all(t.is_cacheable_type() for t in self.type_args)
        if self.type in [
            "comfy.image_tensor",
            "comfy.conditioning"
        ]:
            return True
        if self.is_comfy_type():
            return False
        return True
    
    def is_serializable_type(self):
        if self.is_list_type() or self.is_union_type() or self.is_dict_type():
            return all(t.is_cacheable_type() for t in self.type_args)
        if self.type in [
            "comfy.image_tensor",
        ]:
            return True
        if self.is_comfy_type():
            return False
        return True
    
    def is_comfy_type(self):
        return self.type.startswith("comfy.")
    
    def is_comfy_model(self):
        return self.type in [
            "comfy.unet",
            "comfy.clip",
            "comfy.vae",
            "comfy.control_net",
        ]

    def is_model_file_type(self):
        return self.type in [
            "comfy.clip_vision_file",
            "comfy.checkpoint_file",
            "comfy.control_net_file",
            "comfy.gligen_file",
            "comfy.upscale_model_file",
            "comfy.unclip_file",
        ]
    
    def is_primitive_type(self):
        return self.type in ["int", "float", "bool", "str", "text"]

    def is_enum_type(self):
        return self.type == "enum"

    def is_list_type(self):
        return self.type == "list"
    
    def is_dict_type(self):
        return self.type == "dict"

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
