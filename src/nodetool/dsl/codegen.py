from enum import EnumMeta
import os
import inspect
import pkgutil
from types import GenericAlias, UnionType
from typing import get_type_hints, Union, Tuple
import importlib

from nodetool.metadata.utils import is_enum_type
from nodetool.workflows.base_node import BaseNode


"""
This script generates DSL modules based on all nodes in the source root module.
"""


def create_python_module_file(filename: str, content: str) -> None:
    """
    Create a Python module file with the given filename and content.

    Args:
      filename (str): The path and name of the file to be created.
      content (str): The content to be written to the file.

    Returns:
      None
    """
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, "w") as file:
        file.write(content)


def type_to_string(field_type: type) -> str:
    """
    Converts a Python type to a string representation.

    Args:
      field_type (type): The Python type to convert.

    Returns:
      str: The string representation of the type.
    """
    if isinstance(field_type, UnionType):
        return str(field_type)
    if field_type == Union:
        return " | ".join(field_type.__args__)
    if isinstance(field_type, GenericAlias):
        args = [type_to_string(arg) for arg in field_type.__args__]
        if field_type.__origin__ == list:
            return f"list[{args[0]}]"
        elif field_type.__origin__ == dict:
            return f"dict[{args[0]}, {args[1]}]"
        elif field_type.__origin__ == set:
            return f"set[{args[0]}]"
        elif field_type.__origin__ == tuple:
            return f"tuple[{', '.join(args)}]"
    return field_type.__name__


def field_default(default_value):
    """
    Returns a string representation of the default value for a field.

    Args:
      default_value: The default value of the field.

    Returns:
      str: The string representation of the default value.

    """
    if default_value is None:
        return "None"
    if isinstance(type(default_value), EnumMeta):
        return f"{type(default_value).__name__}({repr(default_value.value)})"
    return repr(default_value)


def generate_class_source(node_cls: type[BaseNode]) -> str:
    """
    Generate the source code for a graph node class based on the provided node class.
    This class acts as a DSL wrapper for easier connection between nodes.

    Args:
      node_cls (type[BaseNode]): The node class to generate the source code for.

    Returns:
      str: The generated source code for the class.
    """

    imports = ""
    class_body = f"class {node_cls.__name__}(GraphNode):\n"
    fields = node_cls.inherited_fields()
    node_type = node_cls.get_node_type()

    for field_name, field_type in node_cls.field_types().items():
        if not field_name in fields:
            continue
        if is_enum_type(field_type):
            imports += f"from {field_type.__module__} import {field_type.__name__}\n"  # type: ignore
        field = fields[field_name]
        new_field_type = f"{type_to_string(field_type)} | GraphNode | tuple[GraphNode, str]"  # type: ignore
        field_def = f"Field(default={field_default(field.default)}, description={repr(field.description)})"
        class_body += f"    {field_name}: {new_field_type} = {field_def}\n"

    class_body += "    @classmethod\n"
    class_body += f'    def get_node_type(cls): return "{node_type}"\n'

    return imports + "\n" + class_body


def create_dsl_modules(source_root: str, target_root: str):
    """
    Generate DSL modules based on the source root and target root.

    Args:
      source_root (str): The source root module name.
      target_root (str): The target root module name.
    """
    source_root_module = importlib.import_module(source_root)
    target_root_module = importlib.import_module(target_root)
    target_root_path = str(target_root_module.__path__[0])

    for _, module_name, _ in pkgutil.walk_packages(
        source_root_module.__path__, prefix=source_root_module.__name__ + "."
    ):
        print(module_name)
        target_module_name: str = module_name.replace(source_root, target_root)
        module = importlib.import_module(module_name)
        source_code = ""
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseNode) and obj is not BaseNode and obj.is_visible():
                source_code += generate_class_source(obj)
                source_code += "\n\n"

        if source_code == "":
            continue

        target_module_path = target_module_name.replace(
            target_root_module.__name__ + ".", ""
        ).replace(".", "/")

        target_path = os.path.join(target_root_path, target_module_path) + ".py"
        source_code = (
            "from pydantic import BaseModel, Field\n"
            "import nodetool.metadata.types\n"
            "from nodetool.metadata.types import *\n"
            "from nodetool.dsl.graph import GraphNode\n\n"
        ) + source_code
        create_python_module_file(target_path, source_code)


if __name__ == "__main__":
    create_dsl_modules("nodetool.nodes", "nodetool.dsl")
