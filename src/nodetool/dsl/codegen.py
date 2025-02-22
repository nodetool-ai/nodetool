from enum import Enum, EnumMeta
import os
import inspect
import pkgutil
from types import GenericAlias, UnionType
from typing import Any, Union
import importlib
import shutil

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
      enum_name (str): The name of the enum type if the field type is an enum.

    Returns:
      str: The string representation of the type.
    """
    if isinstance(field_type, UnionType):
        return str(field_type)
    if isinstance(field_type, str):
        return field_type
    if isinstance(field_type, dict):
        return "dict"
    if field_type.__name__ == "Optional":
        return f"{type_to_string(field_type.__args__[0])} | None"
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


def field_default(default_value: Any, enum_name: str | None = None) -> str:
    """
    Returns a string representation of the default value for a field.

    Args:
      default_value: The default value of the field.
      enum_name: The name of the enum type if the default value is an enum.

    Returns:
      str: The string representation of the default value.

    """
    if default_value is None:
        return "None"
    if enum_name is not None:
        return f"{enum_name}({repr(default_value)})"
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

    # Add class docstring if it exists
    if node_cls.__doc__:
        class_body += f'    """{node_cls.__doc__}"""\n\n'

    fields = node_cls.inherited_fields()
    node_type = node_cls.get_node_type()

    # First, add enum types as class attributes
    for field_name, field_type in node_cls.field_types().items():
        if not field_name in fields:
            continue
        if is_enum_type(field_type):
            imports += f"import {field_type.__module__}\n"
            class_body += f"    {field_type.__name__}: typing.ClassVar[type] = {field_type.__module__}.{node_cls.__name__}.{field_type.__name__}\n"

    # Then add the fields
    for field_name, field_type in node_cls.field_types().items():
        if not field_name in fields:
            continue
        field = fields[field_name]
        if is_enum_type(field_type):
            new_field_type = (
                f"{field_type.__module__}.{node_cls.__name__}.{field_type.__name__}"
            )
            if isinstance(field.default, Enum):
                field_def = f"Field(default={field_type.__name__}.{field.default.name}, description={repr(field.description)})"
            else:
                field_def = f"Field(default={field_type.__name__}({repr(field.default)}), description={repr(field.description)})"
        else:
            new_field_type = f"{type_to_string(field_type)} | GraphNode | tuple[GraphNode, str]"  # type: ignore
            field_def = f"Field(default={field_default(field.default)}, description={repr(field.description)})"
        class_body += f"    {field_name}: {new_field_type} = {field_def}\n"

    class_body += "\n    @classmethod\n"
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

    # Remove existing target directory
    # shutil.rmtree(target_root_path)

    for _, module_name, _ in pkgutil.walk_packages(
        source_root_module.__path__, prefix=source_root_module.__name__ + "."
    ):
        target_module_name: str = module_name.replace(source_root, target_root)
        target_module_path = target_module_name.replace(
            target_root_module.__name__ + ".", ""
        ).replace(".", "/")

        full_target_path = os.path.join(target_root_path, target_module_path)
        print(f"Removing {full_target_path}")
        if os.path.exists(full_target_path):
            shutil.rmtree(full_target_path)

        module = importlib.import_module(module_name)
        source_code = ""
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseNode) and obj is not BaseNode and obj.is_visible():
                source_code += generate_class_source(obj)
                source_code += "\n\n"

        if source_code == "":
            continue

        # Check if the original module is an __init__.py file
        if module.__file__.endswith("__init__.py"):  # type: ignore
            target_path = os.path.join(
                target_root_path, target_module_path, "__init__.py"
            )
        else:
            target_path = os.path.join(target_root_path, target_module_path) + ".py"

        source_code = (
            "from pydantic import BaseModel, Field\n"
            "import typing\n"
            "import nodetool.metadata.types\n"
            "from nodetool.metadata.types import *\n"
            "from nodetool.dsl.graph import GraphNode\n\n"
        ) + source_code

        print(f"Writing {target_path}")
        create_python_module_file(target_path, source_code)


if __name__ == "__main__":
    create_dsl_modules("nodetool.nodes", "nodetool.dsl")
