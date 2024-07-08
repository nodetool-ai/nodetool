import inspect
import os
from typing import IO, Any, Type, Union
import importlib
from pydantic import BaseModel
import dotenv

dotenv.load_dotenv()


def generate_documentation(
    base_module: Union[str, Type[Any]], output_dir: str = "docs"
) -> None:
    """
    Generate comprehensive documentation for a given module and its submodules.

    Args:
        base_module (Union[str, Type[Any]]): The base module to document. Can be a string (module name) or a module object.
        output_dir (str): The directory where documentation will be generated. Defaults to "docs".

    This function will:
    1. Process all classes, functions, and submodules in the given module.
    2. Generate markdown files with detailed documentation.
    3. Create a directory structure mirroring the module structure.
    """
    if isinstance(base_module, str):
        base_module = importlib.import_module(base_module)

    os.makedirs(output_dir, exist_ok=True)
    process_module(base_module, output_dir)


def defined_in_module(obj: Any, module: Type[Any]) -> bool:
    """
    Check if an object is defined in a given module.

    Args:
        obj (Any): The object to check.
        module (Type[Any]): The module to check against.

    Returns:
        bool: Whether the object is defined in the module.
    """
    return hasattr(obj, "__module__") and obj.__module__ == module.__name__


def process_module(
    module: Type[Any],
    base_path: str,
    root_module: str | None = None,
    current_depth: int = 0,
) -> None:
    """
    Process a module and generate documentation for its contents.

    Args:
        module (Type[Any]): The module to process.
        base_path (str): The base path for documentation output.
        root_module (str): The name of the root module (used for relative path calculation).
        current_depth (int): The current depth in the module hierarchy.
    """
    if root_module is None:
        root_module = module.__name__.split(".")[0]

    # Calculate the relative path
    module_parts = module.__name__.split(".")
    relative_parts = module_parts[module_parts.index(root_module) + 1 :]
    module_name = "/".join(relative_parts) if len(relative_parts) > 0 else "index"

    module_path = os.path.join(base_path, f"{module_name}.md")
    os.makedirs(os.path.dirname(module_path), exist_ok=True)
    print(f"Processing {module_name} -> {module_path}")

    with open(module_path, "w") as file:
        file.write(f"# {module.__name__}\n\n")
        if module.__doc__:
            file.write(f"{module.__doc__.strip()}\n\n")

        for name, obj in inspect.getmembers(module):
            if inspect.ismodule(obj) and obj.__name__.startswith(module.__name__):
                process_module(obj, base_path, root_module, current_depth + 1)
                submodule_parts = obj.__name__.split(".")

                # remove parts that are common with the current module
                if module_name == "index":
                    common_parts = 2
                else:
                    common_parts = 0
                    for i in range(len(submodule_parts)):
                        if len(module_parts) <= i:
                            break
                        if submodule_parts[i] != module_parts[i]:
                            break
                        common_parts += 1

                relative_path = "/".join(submodule_parts[common_parts - 1 :])

                file.write(f"- [{obj.__name__}]({relative_path}.md)\n")

            if name.startswith("_"):
                continue
            if defined_in_module(obj, module):
                if inspect.isclass(obj):
                    document_class(file, obj)
                elif inspect.isfunction(obj):
                    document_function(file, obj)


def exract_desc_and_tags(docstring: str) -> tuple[str, list[str]]:
    """
    Extract description and tags from a docstring.

    Args:
        docstring (str): The docstring to extract from.

    Returns:
        tuple[str, list[str]]: A tuple containing the description and tags.
    """
    lines = docstring.strip().split("\n")

    # Remove leading whitespace
    lines = [line.strip() for line in lines]
    if len(lines) == 1:
        return lines[0], []
    else:
        return "\n".join(lines[:1] + lines[2:]), lines[1].strip().split(", ")


def type_to_str(tp: Type[Any]) -> str:
    """
    Convert a type to a string representation.

    Args:
        tp (Type[Any]): The type to convert.

    Returns:
        str: The string representation of the type.
    """
    if tp == inspect.Parameter.empty:
        return "Any"
    if tp == int:
        return "int"
    if tp == float:
        return "float"
    if tp == str:
        return "str"
    if tp == bool:
        return "bool"
    if tp == list:
        return "list"
    if tp == dict:
        return "dict"
    if tp == tuple:
        return "tuple"
    if tp == set:
        return "set"
    if tp == type(None):
        return "None"
    if isinstance(tp, type):
        return tp.__name__
    return str(tp)


def docstring_to_markdown(docstring):
    # Remove leading/trailing whitespace and quotes
    cleaned = docstring.strip().strip('"""')

    # Split into lines
    lines = cleaned.split("\n")

    # Process the lines
    markdown = []
    in_list = False
    for line in lines:
        line = line.strip()

        # Check for section headers
        if line.endswith(":"):
            markdown.append(f"\n**{line}**\n")
            in_list = False
        elif line.startswith("- "):
            if not in_list:
                markdown.append("")
                in_list = True
            markdown.append(line)
        elif ":" in line and not line.startswith(" "):
            # Handle key-value pairs (like Args and Returns)
            key, value = line.split(":", 1)
            markdown.append(f"- **{key.strip()}**: {value.strip()}")
        else:
            if in_list and line:
                markdown.append(f"  {line}")
            else:
                markdown.append(line)
                in_list = False

    # Join the processed lines
    return "\n".join(markdown).strip()


def document_class(file: Any, cls: Type[Any]) -> None:
    """
    Document a class, including its docstring, base classes, and fields (if it's a Pydantic model).

    Args:
        file (Any): The file object to write documentation to.
        cls (Type[Any]): The class to document.
    """
    file.write(f"## {cls.__name__}\n\n")
    if cls.__doc__:
        description, tags = exract_desc_and_tags(cls.__doc__)
        file.write(f"{description}\n\n")
        if len(tags) > 0:
            file.write(f"**Tags:** {', '.join(tags)}\n\n")

    # base_classes = ", ".join(
    #     [base.__name__ for base in cls.__bases__ if base != object]
    # )
    # if base_classes:
    #     file.write(f"**Inherits from:** {base_classes}\n\n")

    if issubclass(cls, BaseModel):
        # file.write("### Fields:\n\n")
        for name, field in cls.model_fields.items():
            file.write(f"- **{name}**")
            if field.description:
                file.write(f": {field.description}")
            if field.annotation:
                file.write(f" ({type_to_str(field.annotation)})\n")
        file.write("\n")

    document_methods(file, cls)


def defined_in_class(obj: Any, cls: Type[Any]) -> bool:
    """
    Check if an object is defined in a given class.

    Args:
        obj (Any): The object to check.
        cls (Type[Any]): The class to check against.

    Returns:
        bool: Whether the object is defined in the class.
    """
    return hasattr(obj, "__qualname__") and obj.__qualname__.startswith(cls.__name__)


SKIPPED_METHODS = ["__init__", "process"]


def document_methods(file: Any, cls: Type[Any]) -> None:
    """
    Document the methods of a class.

    Args:
        file (Any): The file object to write documentation to.
        cls (Type[Any]): The class whose methods to document.
    """
    methods = inspect.getmembers(cls, predicate=inspect.isfunction)
    if methods:
        # file.write("### Methods:\n\n")
        for name, method in methods:
            if name.startswith("_") or name in SKIPPED_METHODS:
                continue
            if not defined_in_class(method, cls):
                continue
            document_function(file, method, is_method=True)


def document_function(file: Any, func: Any, is_method: bool = False) -> None:
    """
    Document a function or method, including its signature, docstring, and parameters.

    Args:
        file (Any): The file object to write documentation to.
        func (Any): The function or method to document.
        is_method (bool): Whether the function is a method of a class.
    """
    signature = inspect.signature(func)
    params = signature.parameters

    file.write(f"### {func.__name__}\n\n")

    if func.__doc__:
        file.write(docstring_to_markdown(func.__doc__) + "\n")
        contains_args = "Args:" in func.__doc__
        contains_returns = "Returns:" in func.__doc__
    else:
        contains_args = False
        contains_returns = False

    if not contains_args and params and len(params) > 0:
        file.write("**Args:**\n")
        for name, param in params.items():
            if name == "self":
                continue
            file.write(f"- **{name}")
            if param.annotation != inspect.Parameter.empty:
                file.write(f" ({type_to_str(param.annotation)})")
            if param.default != inspect.Parameter.empty:
                file.write(f" (default: {param.default})")
            file.write("**\n")
        file.write("\n")

    if not contains_returns and signature.return_annotation != inspect.Signature.empty:
        file.write(f"**Returns:** {type_to_str(signature.return_annotation)}\n\n")


if __name__ == "__main__":
    import nodetool.nodes.anthropic
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate
    import nodetool.nodes.ollama
    import nodetool.api.asset
    import nodetool.api.auth
    import nodetool.api.job
    import nodetool.api.message
    import nodetool.api.model
    import nodetool.api.node
    import nodetool.api.prediction
    import nodetool.api.storage
    import nodetool.api.task
    import nodetool.api.workflow
    import nodetool.models.asset
    import nodetool.models.job
    import nodetool.models.message
    import nodetool.models.user
    import nodetool.models.message
    import nodetool.models.prediction
    import nodetool.models.task
    import nodetool.models.workflow
    import nodetool.models.schema
    import nodetool.models.sqlite_adapter
    import nodetool.models.thread

    generate_documentation(nodetool)
