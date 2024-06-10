import os
from typing import Any, Type
from time import sleep
import httpx
from openapi_pydantic.v3.parser import OpenAPIv3
from nodetool.common.environment import Environment
from openapi_pydantic.v3 import parse_obj
from nodetool.common.replicate_node import (
    TypeName,
    capitalize,
    create_enum_from_schema,
    generate_model_source_code,
    log,
    parse_model_info,
    replicate_nodes_folder,
)

classes_by_namespace: dict[str, set] = {}
enums_by_namespace: dict[str, set] = {}


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


def create_replicate_node(
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
