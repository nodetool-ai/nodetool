import asyncio
from time import sleep
from typing import Any, Type, get_origin

import os
import httpx
import re
from bs4 import BeautifulSoup

from typing import Any, Type
from openapi_pydantic.v3 import (
    DataType,
    Schema,
    Reference,
)
from openapi_pydantic.v3.parser import OpenAPIv3
from enum import Enum

from pydantic import ConfigDict
from nodetool.common.environment import Environment
from nodetool.dsl.codegen import field_default, type_to_string
from nodetool.metadata.types import AudioRef, ImageRef, Tensor, VideoRef
from nodetool.metadata.utils import is_enum_type
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import httpx
from typing import Any, Type
import os


log = Environment.get_logger()
current_folder = os.path.dirname(os.path.abspath(__file__))
replicate_nodes_folder = os.path.join(
    os.path.dirname(current_folder), "nodes", "replicate"
)

REPLICATE_MODELS = {}


def add_replicate_model(model_id: str, model_info: dict[str, Any]):
    REPLICATE_MODELS[model_id] = model_info


async def convert_output_value(
    value: Any, t: Type[Any], output_index: int = 0, output_key: str = "output"
):
    """
    Converts the output value to the specified type.
    Performs automatic conversions using heuristics.

    Args:
        value (Any): The value to be converted.
        t (Type[Any]): The target type to convert the value to.
        output_index: The index for list outputs to use.

    Returns:
        Any: The converted value.

    Raises:
        TypeError: If the value is not of the expected type.

    """
    if value is None:
        return None

    if isinstance(value, t):
        return value

    if t in (ImageRef, AudioRef, VideoRef):
        if type(value) == list:
            return t(uri=str(value[output_index])).model_dump()
        elif type(value) == dict:
            if output_key in value:
                return t(uri=value[output_key]).model_dump()
            else:
                raise ValueError(f"Output key not found: {output_key}")
        elif type(value) == str:
            return t(uri=value).model_dump()
        else:
            raise TypeError(f"Invalid {t} value: {value}")
    elif t == str:
        if type(value) == list:
            return "".join(str(i) for i in value)
        else:
            return str(value)
    elif t == Tensor:
        return Tensor.from_list(value).model_dump()
    elif get_origin(t) == list:
        if type(value) != list:
            raise TypeError(f"value is not list: {value}")
        tasks = [convert_output_value(item, t.__args__[0]) for item in value]  # type: ignore
        return await asyncio.gather(*tasks)
    return value


class ReplicateNode(BaseNode):
    """
    This is the base class for all replicate nodes.

    Methods:
        replicate_model_id: Returns the model ID for replication.
        get_hardware: Returns the hardware information.
        run_replicate: Runs prediction on Replicate.
        extra_params: Returns any extra parameters.
        process: Processes the prediction output.
        convert_output: Converts the output to the specified type.

    """

    model_config = ConfigDict(protected_namespaces=())

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not ReplicateNode

    @classmethod
    def __init_subclass__(cls):
        """
        This method is called when a subclass of this class is created.
        We remember the model_id and corresponding model_info for each subclass.
        """
        super().__init_subclass__()
        model_info = cls.model_info().copy()
        model_info["hardware"] = cls.get_hardware()
        add_replicate_model(cls.replicate_model_id(), model_info)

    @classmethod
    def replicate_model_id(cls) -> str:
        """
        Subclasses need to implement this method to return the model ID to run.
        """
        raise NotImplementedError()

    @classmethod
    def get_hardware(cls) -> str:
        """
        Subclasses need to implement this method to return the hardware information.
        """
        return ""

    def get_output_index(self) -> int:
        return 0

    def output_key(self) -> str:
        return "output"

    async def run_replicate(
        self, context: ProcessingContext, params: dict[(str, Any)] | None = None
    ):
        """
        Run prediction on Replicate.

        Args:
            context: The processing context.
            params: Optional dictionary of parameters.

        Returns:
            Result of the prediction.
        """
        raw_inputs = {
            prop.name: convert_enum_value(getattr(self, prop.name))
            for prop in self.properties()
        }
        raw_inputs = {**raw_inputs, **(params or {})}

        input_params = {
            prop.name: await context.convert_value_for_prediction(
                prop,
                getattr(self, prop.name),
            )
            for prop in self.properties()
        }
        input_params = {
            key: value for (key, value) in input_params.items() if (value is not None)
        }
        input_params = {**input_params, **(params or {})}

        return await context.run_prediction(
            provider="replicate",
            node_id=self.id,
            model=self.replicate_model_id(),
            params=input_params,
        )

    async def process(self, context: ProcessingContext):
        """
        Process the prediction output.

        Args:
            context: The processing context.

        Returns:
            The processed output.

        Raises:
            ValueError: If prediction failed.

        """
        result = await self.run_replicate(context)
        return result

    async def convert_output(self, context: ProcessingContext, output: Any) -> Any:
        """
        Convert the output to the specified type.

        Args:
            context: The processing context.
            output: The output to be converted.

        Returns:
            The converted output.

        """
        t = self.return_type()
        if isinstance(t, dict):
            return {
                key: await convert_output_value(
                    output[key],
                    t[key],
                )
                for key in t
            }
        if isinstance(t, Type):
            output = await convert_output_value(
                output,
                t,
                output_index=self.get_output_index(),
                output_key=self.output_key(),
            )
        return {
            "output": output,
        }


class TypeName:
    """
    A class representing a type name.

    Attributes:
        __name__ (str): The name of the type.
    """

    def __init__(self, name: str):
        self.__name__ = name


def convert_enum_value(value: Any):
    """
    Converts an enum value to its corresponding value.

    Args:
        value (Any): The value to be converted.

    Returns:
        Any: The converted value.
    """
    if isinstance(value, Enum):
        return value.value
    return value


def sanitize_enum(name: str) -> str:
    """
    Sanitizes an enum string by replacing hyphens, dots, and spaces with underscores.

    Args:
        enum (str): The enum string to be sanitized.

    Returns:
        str: The sanitized enum string.
    """
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name).upper()
    while len(name) > 0 and name[0] == "_":
        name = name[1:]
    while len(name) > 0 and name[-1] == "_":
        name = name[:-1]
    if name[0].isdigit():
        name = "_" + name
    return name


def capitalize(name: str) -> str:
    """
    Capitalizes the first letter of a string.

    Args:
        name (str): The string to be capitalized.

    Returns:
        str: The capitalized string.
    """
    return name[0].upper() + name[1:]


def create_enum_from_schema(name: str, schema: Schema):
    """
    Create source code for an enum model.

    Args:
        name (str): The name of the enum model.
        schema (Schema): The OpenAPI schema containing the enum field.

    Returns:
        str: The source code of the enum model.

    Raises:
        ValueError: If the schema has no enum field.
    """
    if schema.enum is not None:
        enum_type = type(schema.enum[0])
        values = "".join(
            [
                f"    {sanitize_enum(str(value))} = {repr(value)}\n"
                for value in schema.enum
            ]
        )
        return f"class {name}({enum_type.__name__}, Enum):\n" + values
    else:
        raise ValueError("Schema has no enum field")


def convert_datatype_to_type(
    datatype: DataType | list[DataType], is_optional: bool
) -> type:
    """
    Converts an OpenAPI property schema to a Pydantic field.

    Args:
        datatype (DataType | list[DataType]): The datatype or list of datatypes to convert.
        is_optional (bool): Whether the field is optional.

    Returns:
        type: The type of the field.

    Raises:
        ValueError: If the datatype is a list.

    """
    if isinstance(datatype, list):
        raise ValueError("Cannot convert list of datatypes to type")
    t = None
    if datatype == DataType.STRING:
        t = str
    elif datatype == DataType.NUMBER:
        t = float
    elif datatype == DataType.INTEGER:
        t = int
    elif datatype == DataType.BOOLEAN:
        t = bool
    elif datatype == DataType.ARRAY:
        t = list
    elif datatype == DataType.OBJECT:
        t = dict
    else:
        raise ValueError(f"Unknown type: {datatype}")
    if is_optional:
        return t | None  # type: ignore
    return t


def default_for(datatype: DataType | list[DataType] | None) -> Any:
    if datatype == DataType.STRING:
        return ""
    elif datatype == DataType.NUMBER:
        return 0.0
    elif datatype == DataType.INTEGER:
        return 0
    elif datatype == DataType.BOOLEAN:
        return False
    elif datatype == DataType.ARRAY:
        return []
    elif datatype == DataType.OBJECT:
        return {}
    else:
        return None


def return_type_repr(return_type: type) -> str:
    if isinstance(return_type, dict):
        return (
            "{"
            + ", ".join(f"'{k}': {type_to_string(v)}" for k, v in return_type.items())
            + "}\n"
        )
    else:
        return type_to_string(return_type)


def generate_model_source_code(
    model_name: str,
    model_info: dict[str, Any],
    description: str,
    schema: Schema,
    type_lookup: dict[str, type],
    return_type: type,
    hardware: str,
    replicate_model_id: str,
    overrides: dict[str, type] = {},
    output_index: int = 0,
    output_key: str = "output",
) -> str:
    """
    Generate source code for a Pydantic model from an OpenAPI schema.

    Args:
        model_name (str): The class name of the model.
        model_info (dict[str, Any]): The model information.
        description (str): Description of the model.
        schema (Schema): The schema object.
        type_lookup (Dict[str, Type]): Mapping of type names to Python types.
        return_type (Type): The return type of the model.
        hardware (str): The hardware information.
        replicate_model_id (str): The replicate model ID.
        overrides (Dict[str, Type], optional): Field type overrides. Defaults to {}.
        output_index (int, optional): The index for list outputs to use. Defaults to 0.
        output_key (str, optional): The key for dict outputs to use. Defaults to "output".

    Returns:
        str: The source code of the model.

    Raises:
        ValueError: If the schema has no properties or if the 'allOf' type cannot be handled.
    """

    if not schema.properties:
        raise ValueError("Schema has no properties")

    imports = ""

    lines = [
        f"class {model_name}(ReplicateNode):",
        '    """' + description + '"""',
        "",
        "    @classmethod",
        f"    def replicate_model_id(cls): return '{replicate_model_id}'",
        "    @classmethod",
        f"    def get_hardware(cls): return '{hardware}'",
        "    @classmethod",
        f"    def model_info(cls): return {repr(model_info)}",
    ]
    if return_type:
        lines += [
            "    @classmethod",
            f"    def return_type(cls): return {return_type_repr(return_type)}",
        ]

    if output_index > 0:
        lines.append(f"   def output_index(self): return {output_index}")

    if output_key != "output":
        lines.append(f"    def output_key(self): return '{output_key}'")

    lines.append("\n")

    for name, prop in schema.properties.items():
        if name == "api_key" or isinstance(prop, Reference):
            continue

        is_optional = prop.default is None

        field_type, field_args = Any, ""
        if name in overrides:
            field_type = overrides[name]
            field_args = f" = Field(default={field_type.__name__}(), description={repr(prop.description)})"
        else:
            if prop.type:
                field_type = convert_datatype_to_type(prop.type, is_optional)
            elif prop.allOf:
                ref_type = prop.allOf[0]
                if hasattr(ref_type, "ref"):
                    ref = ref_type.ref  # type: ignore
                    field_type = type_lookup[ref]

            field_args = " = Field("
            if prop.title:
                field_args += f"title='{prop.title}', "
            if prop.description:
                field_args += f"description={repr(prop.description)}, "
            if prop.minimum is not None:
                field_args += f"ge={prop.minimum}, "
            if prop.maximum is not None:
                field_args += f"le={prop.maximum}, "
            field_args += f"default={field_default(prop.default)})"

        if is_enum_type(field_type):
            imports += f"from {field_type.__module__} import {field_type.__name__}\n"

        lines.append(f"    {name}: {type_to_string(field_type)}{field_args}")

    return imports + "\n\n" + "\n".join(lines)


def parse_model_info(url: str):
    """
    Parses the replicate model information from the given URL.

    Args:
        url (str): The URL to fetch the HTML content from.

    Returns:
        dict: A dictionary containing the parsed model information.
    """

    # Fetch the HTML content
    response = httpx.get(url)
    response.raise_for_status()
    html_content = response.content

    # Parse the HTML content with BeautifulSoup
    soup = BeautifulSoup(html_content, "html.parser")

    # Find the section titled "Run time and cost"
    runtime_section = soup.find("div", {"id": "performance"})

    if runtime_section:
        # Extract the hardware information
        hardware_info = runtime_section.find("p", string=lambda text: "hardware" in text.lower())  # type: ignore
        if hardware_info:
            match = re.search(
                r"This model runs on (.+?) hardware", hardware_info.text.strip()
            )
            if match:
                hardware = match.group(1)
            else:
                hardware = hardware_info.text.strip()
        else:
            hardware = "None"

        return {"hardware": hardware}
    else:
        return {}
