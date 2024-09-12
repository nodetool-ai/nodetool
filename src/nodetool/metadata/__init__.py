from enum import Enum
from nodetool.metadata.types import NameToType

from nodetool.metadata.type_metadata import TypeMetadata
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

    # TODO: implement type checking for comfy types
    if type_meta.is_comfy_type():
        return True

    if python_type == dict and "type" in value:
        return value["type"] == type_meta.type

    if type_meta.type == "list" and python_type == list:
        t = type_meta.type_args[0]
        return all(is_assignable(t, v) for v in value)
    if type_meta.type == "dict" and python_type == dict:
        if len(type_meta.type_args) != 2:
            return True
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
            return "type" in value and value["type"] == asset_type
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
        else:
            assert type_meta.values is not None
            return value in type_meta.values

    return python_type == NameToType[type_meta.type]


def typecheck(type1: TypeMetadata, type2: TypeMetadata) -> bool:
    if type1.type == "any" or type2.type == "any":
        return True

    if type1.type != type2.type:
        return False

    if type1.is_comfy_type() and type2.is_comfy_type():
        return type1.type == type2.type

    if type1.type == "list" and type2.type == "list":
        return typecheck(type1.type_args[0], type2.type_args[0])

    if type1.type == "dict" and type2.type == "dict":
        if len(type1.type_args) != 2 or len(type2.type_args) != 2:
            return True
        return typecheck(type1.type_args[0], type2.type_args[0]) and typecheck(
            type1.type_args[1], type2.type_args[1]
        )

    if type1.type == "tensor" and type2.type == "tensor":
        return typecheck(type1.type_args[0], type2.type_args[0])

    if type1.type == "union" and type2.type == "union":
        return all(
            any(typecheck(t1, t2) for t2 in type2.type_args) for t1 in type1.type_args
        )

    if type1.type == "enum" and type2.type == "enum":
        return set(type1.values or []) == set(type2.values or [])

    return type1.type == type2.type
