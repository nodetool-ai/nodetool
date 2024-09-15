import asyncio
from time import sleep
from typing import Any, Type, get_origin

import os
import httpx
import re
from bs4 import BeautifulSoup

from typing import Any, Type
from openapi_pydantic.v3.parser import OpenAPIv3
from enum import Enum

from pydantic import ConfigDict
from nodetool.common.environment import Environment
from nodetool.metadata.types import AudioRef, ImageRef, Provider, Tensor, VideoRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import httpx
from typing import Any, Type
import os


log = Environment.get_logger()

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
                if len(value) == 0:
                    raise ValueError(f"Invalid {t} value: {value}")
                uri = list(value.values())[0]
                return t(uri=uri).model_dump()
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
            provider=Provider.Replicate,
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
