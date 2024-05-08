from time import sleep
from typing import Any, Type

import os
import httpx
import asyncio
import re
from bs4 import BeautifulSoup

from datetime import datetime
from typing import Any, Type, get_origin
from openapi_pydantic.v3 import (
    parse_obj,
    DataType,
    Schema,
    Reference,
)
from openapi_pydantic.v3.parser import OpenAPIv3
from enum import Enum
from nodetool.common.environment import Environment
from nodetool.dsl.codegen import field_default, type_to_string
from nodetool.metadata.types import Tensor
from nodetool.metadata.utils import is_enum_type
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import VideoRef
from nodetool.workflows.types import NodeUpdate
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from replicate.prediction import Prediction as ReplicatePrediction
import httpx
import asyncio
from typing import Any, Type
import os


log = Environment.get_logger()
current_folder = os.path.dirname(os.path.abspath(__file__))
replicate_nodes_folder = os.path.join(
    os.path.dirname(current_folder), "nodes", "replicate"
)


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

    _visible = False

    def replicate_model_id(self) -> str:
        """
        Subclasses need to implement this method to return the model ID to run.
        """
        raise NotImplementedError()

    def get_hardware(self) -> str:
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
    ) -> ReplicatePrediction | None:
        """
        Run prediction on Replicate.

        Args:
            context: The processing context.
            params: Optional dictionary of parameters.

        Returns:
            ReplicatePrediction if successful, None otherwise.

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

        return await run_replicate(
            context=context,
            node_id=self._id,
            node_type=self.get_node_type(),
            model_id=self.replicate_model_id(),
            input_params=input_params,
            hardware=self.get_hardware(),
        )

    async def extra_params(self, context: ProcessingContext) -> dict:
        return {}

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
        params = await self.extra_params(context)
        pred = await self.run_replicate(context, params)
        if pred is None:
            raise ValueError("Prediction failed")
        return pred.output

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
            return output
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


def calculate_llm_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = {
        "meta/meta-llama-3-8b": (0.05, 0.25),
        "meta/meta-llama-3-13b": (0.10, 0.50),
        "meta/meta-llama-3-70b": (0.65, 2.75),
        "meta/meta-llama-3-8b-instruct": (0.05, 0.25),
        "meta/meta-llama-3-13b-instruct": (0.10, 0.50),
        "meta/meta-llama-3-70b-instruct": (0.65, 2.75),
        "mistralai/mistral-7b-v0.2": (0.05, 0.25),
        "mistralai/mistral-7b-instruct-v0.2": (0.05, 0.25),
        "mistralai/mixtral-8x7b-instruct-v0.1": (0.30, 1.00),
    }

    model = model.split(":")[0]

    if model not in pricing:
        raise ValueError(f"Unsupported model: {model}")

    input_cost_per_million, output_cost_per_million = pricing[model]

    input_cost = input_tokens * input_cost_per_million / 1_000_000
    output_cost = output_tokens * output_cost_per_million / 1_000_000

    return input_cost + output_cost


def calculate_cost(hardware: str, duration: float):
    pricing = {
        "CPU": 0.000100,
        "Nvidia T4 GPU": 0.000225,
        "Nvidia A40 GPU": 0.000575,
        "Nvidia A40 (Large) GPU": 0.000725,
        "Nvidia A100 (40GB) GPU": 0.001150,
        "Nvidia A100 (80GB) GPU": 0.001400,
        "8x Nvidia A40 (Large) GPU": 0.005800,
    }

    if hardware in pricing:
        price_per_second = pricing[hardware]
        total_price = price_per_second * duration
        return total_price
    else:
        raise ValueError(f"Unsupported hardware: {hardware}")


async def run_replicate(
    context: ProcessingContext,
    node_type: str,
    node_id: str,
    model_id: str,
    input_params: dict,
    hardware: str,
):
    """
    Run the model on Replicate API

    Args:
        context (ProcessingContext): The processing context.
        node_type (str): The type of the node.
        node_id (str): The ID of the node.
        model_id (str): The ID of the model to be replicated.
        input_params (dict): The input parameters for the API call.
        hardware (str): The hardware configuration for the API endpoint.

    Returns:
        ReplicatePrediction: The replication prediction object.

    Raises:
        ValueError: If the model version is invalid.

    """

    replicate = Environment.get_replicate_client()

    log.info(f"Running model {model_id}")
    started_at = datetime.now()

    context.post_message(
        NodeUpdate(
            node_id=node_id,
            node_name=model_id,
            status="starting",
            started_at=started_at.isoformat(),
        )
    )

    # Split model_version into owner, name in format owner/name
    match = re.match(r"^(?P<owner>[^/]+)/(?P<name>[^:]+)$", model_id)

    if match:
        owner = match.group("owner")
        name = match.group("name")
        version_id = None
    else:
        # Split model_version into owner, name, version in format owner/name:version
        match = re.match(
            r"^(?P<owner>[^/]+)/(?P<name>[^:]+):(?P<version>.+)$", model_id
        )
        if not match:
            raise ValueError(
                f"Invalid model_version: {model_id}. Expected format: owner/name:version"
            )
        owner = match.group("owner")
        name = match.group("name")
        version_id = match.group("version")

    if version_id:
        replicate_pred = replicate.predictions.create(
            version=version_id,
            input=input_params,
        )
    else:
        replicate_pred = replicate.models.predictions.create(
            model=(owner, name),
            input=input_params,
        )

    prediction = await context.create_prediction(
        provider="replicate",
        model=f"{owner}/{name}",
        version=version_id,
        node_id=node_id,
        node_type=node_type,
    )

    current_status = "starting"

    for i in range(1800):
        replicate_pred = replicate.predictions.get(replicate_pred.id)

        if replicate_pred.status != current_status:
            log.info(f"Prediction status: {replicate_pred.status}")
            current_status = replicate_pred.status

        await context.update_prediction(
            id=prediction.id,
            completed_at=datetime.now(),
            error=replicate_pred.error,
            status=replicate_pred.status,
            logs=replicate_pred.logs,
        )
        if replicate_pred.status in ("failed", "canceled"):
            if replicate_pred.error:
                raise ValueError(replicate_pred.error)
            else:
                raise ValueError("Prediction failed")

        if replicate_pred.status in ("succeeded", "failed", "canceled"):
            break

        await asyncio.sleep(1)

    assert replicate_pred.metrics, "Prediction metrics not found"

    if "input_token_count" in replicate_pred.metrics:
        input_token_count = replicate_pred.metrics["input_token_count"]
        output_token_count = replicate_pred.metrics["output_token_count"]
        cost = calculate_llm_cost(model_id, input_token_count, output_token_count)
    elif "predict_time" in replicate_pred.metrics:
        predict_time = replicate_pred.metrics["predict_time"]
        cost = calculate_cost(hardware, predict_time)
    else:
        raise ValueError("Cost calculation failed")

    await context.update_prediction(id=prediction.id, cost=cost)
    return replicate_pred


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
        f"    def replicate_model_id(self): return '{replicate_model_id}'",
        f"    def get_hardware(self): return '{hardware}'",
        "    @classmethod",
        f"    def model_info(cls): return {repr(model_info)}",
    ]
    if return_type:
        lines += [
            "    @classmethod",
            f"    def return_type(cls): return {type_to_string(return_type)}",
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


def retry_http_request(url: str, headers: dict[str, str], retries: int = 3) -> Any:
    """
    Retry an HTTP request with exponential backoff.

    Args:
        url (str): The URL to make the request to.
        headers (dict[str, str]): The headers to include in the request.
        retries (int, optional): The number of retries. Defaults to 3.

    Returns:
        Any: The response data.

    Raises:
        httpx.RequestError: If the request fails after all retries.
    """
    for attempt in range(retries + 1):
        try:
            response = httpx.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            if attempt < retries:
                delay = 2**attempt
                sleep(delay)
            else:
                raise e


def get_model_api(
    model_id: str,
) -> tuple[OpenAPIv3, str, str, dict[str, Any]]:
    """
    Retrieves the API specification for a specific model and version from the Replicate API.

    Args:
        model_id (str): The replicate model ID.
        model_version (str, optional): The model version. Defaults to None.
    """
    model_name = model_id.replace("/", "_").replace("-", "_").replace(".", "_")

    if "REPLICATE_API_TOKEN" not in os.environ:
        raise ValueError("REPLICATE_API_TOKEN environment variable is not set")

    headers = {
        "Authorization": "Token " + Environment.get_replicate_api_token(),
    }

    log.info("Getting model API: %s", model_id)
    model_info = retry_http_request(
        f"https://api.replicate.com/v1/models/{model_id}",
        headers=headers,
    )
    model_info.update(parse_model_info(f"https://replicate.com/{model_id}"))
    latest_version = model_info["latest_version"]
    api = parse_obj(latest_version["openapi_schema"])
    model_version = latest_version.get("id", "")

    return api, model_id, model_version, model_info


classes_by_namespace: dict[str, set] = {}
enums_by_namespace: dict[str, set] = {}


def replicate_node(
    node_name: str,
    namespace: str,
    model_id: str,
    return_type: Type,
    overrides: dict[str, type] = {},
    output_index: int = 0,
    output_key: str = "output",
):
    """
    Creates a node from a model ID and version.
    Gets the model from the replicate API and creates a node class from it.
    The node class is then added to the NODE_TYPES list.

    Args:
        node_name (str): The name of the node.
        namespace (str): The namespace of the node.
        model_id (str): The ID of the model on replicate.
        return_type (Type): The return type of the node.
        model_version (str, optional): The version of the model. Defaults to None.
        overrides (dict[str, type]): A dictionary of overrides for the node fields.
        output_index (int): The index for list outputs to use. Defaults to 0.
        output_key (str): The key for dict outputs to use. Defaults to "output".

    Returns:
        Replicate: The generated node class.

    Raises:
        ValueError: If the schema has no properties or enum.
    """

    type_lookup = {}
    source_code = ""
    if not namespace in enums_by_namespace:
        enums_by_namespace[namespace] = set()

    api, model_id, model_version, model_info = get_model_api(model_id)

    assert api.components
    assert api.components.schemas

    for name, schema in api.components.schemas.items():
        if name in (
            "Input",
            "Output",
            "Request",
            "Response",
            "PredictionRequest",
            "PredictionResponse",
            "Status",
            "WebhookEvent",
            "ValidationError",
            "HTTPValidationError",
        ):
            continue

        if hasattr(schema, "enum") and schema.enum is not None:  # type: ignore
            capitalized_name = capitalize(name)
            type_lookup[f"#/components/schemas/{name}"] = TypeName(capitalized_name)
            if not name in enums_by_namespace[namespace]:
                source_code += create_enum_from_schema(capitalized_name, schema)  # type: ignore
                enums_by_namespace[namespace].add(name)

    del model_info["default_example"]
    del model_info["latest_version"]

    source_code += generate_model_source_code(
        model_name=node_name,
        model_info=model_info,
        description=model_info.get("description", ""),
        schema=api.components.schemas["Input"],  # type: ignore
        type_lookup=type_lookup,
        overrides=overrides,
        return_type=return_type,
        output_index=output_index,
        output_key=output_key,
        hardware=model_info.get("hardware", None),
        replicate_model_id=f"{model_id}:{model_version}",
    )
    namespace_path = os.path.join(replicate_nodes_folder, namespace.replace(".", "/"))
    namespace_folder = os.path.dirname(namespace_path)
    os.makedirs(namespace_folder, exist_ok=True)

    if not namespace in classes_by_namespace:
        classes_by_namespace[namespace] = set()
        imports = (
            "from pydantic import BaseModel, Field\n"
            "from nodetool.metadata.types import *\n"
            "from nodetool.dsl.graph import GraphNode\n"
            "from nodetool.common.replicate_node import ReplicateNode\n"
            "from enum import Enum\n"
        )
        with open(namespace_path + ".py", "w") as f:
            f.write(imports)

    classes_by_namespace[namespace].add(node_name)

    with open(namespace_path + ".py", "a") as f:
        f.write("\n\n")
        f.write(source_code)
