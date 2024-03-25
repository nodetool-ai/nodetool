from enum import Enum
from nodetool.metadata.types import NameToType, ModelFileEnums

from nodetool.metadata.types import TypeMetadata
from nodetool.metadata.types import Tensor
from typing import Any


TYPE_ENUM_TO_ASSET_TYPE = {
    "audio": "audio",
    "video": "video",
    "image": "image",
    "tensor": "tensor",
    "folder": "folder",
    "file": "file",
    "dataframe": "dataframe",
    "model": "model",
    "thread": "thread",
    "thread_message": "thread_message",
}


def is_assignable(type_meta: TypeMetadata, value: Any) -> bool:
    python_type = type(value)

    if type_meta.type == "any":
        return True

    if type_meta.is_comfy_type():
        return True

    if type_meta.type == "list" and python_type == list:
        t = type_meta.type_args[0]
        return all(is_assignable(t, v) for v in value)
    if type_meta.type == "dict" and python_type == dict:
        t = type_meta.type_args[0]
        u = type_meta.type_args[1]
        return all(
            is_assignable(t, k) and is_assignable(u, v) for k, v in value.items()
        )
    if type_meta.type == "float" and (
        isinstance(value, float) or isinstance(value, int)
    ):
        return True
    if type_meta.type in TYPE_ENUM_TO_ASSET_TYPE:
        asset_type = TYPE_ENUM_TO_ASSET_TYPE[type_meta.type]
        python_class = NameToType[type_meta.type]
        if isinstance(value, dict):
            return value["type"] == asset_type
        else:
            return isinstance(value, python_class)
    if type_meta.type == "tensor" and python_type == Tensor:
        t = type_meta.type_args[0]
        return all(is_assignable(t, v) for v in value)
    if type_meta.type == "union":
        return any(is_assignable(t, value) for t in type_meta.type_args)
    if type_meta.type == "enum":
        if isinstance(value, Enum):
            return value.value in type_meta.values
        elif isinstance(value, str):
            assert type_meta.values is not None
            return value in type_meta.values
        else:
            return False
    if type_meta.type in ModelFileEnums:
        if isinstance(value, dict):
            value = value.get("name", "")
        return isinstance(value, str)

    return python_type == NameToType[type_meta.type]
