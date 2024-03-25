import os
import httpx
import asyncio
import re
from bs4 import BeautifulSoup

from datetime import datetime
from typing import Any, List, Optional, Type, Union, get_origin
from openapi_pydantic.v3 import (
    parse_obj,
    DataType,
    Schema,
    Reference,
)
from openapi_pydantic.v3.parser import OpenAPIv3
from importlib import import_module
from enum import Enum
from pydantic import BaseModel, Field, create_model
from enum import Enum
from replicate.prediction import Prediction as ReplicatePrediction
from nodetool.common.environment import Environment
from nodetool.workflows.types import NodeUpdate
from nodetool.workflows.base_node import BaseNode, add_node_type
from nodetool.metadata.types import Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import VideoRef


log = Environment.get_logger()


current_folder = os.path.dirname(os.path.abspath(__file__))
model_cache_folder = os.path.join(current_folder, "models")


def calculate_llm_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = {
        "meta/llama-2-70b": (0.65, 2.75),
        "meta/llama-2-13b": (0.10, 0.50),
        "meta/llama-2-7b": (0.05, 0.25),
        "meta/llama-2-70b-chat": (0.65, 2.75),
        "meta/llama-2-13b-chat": (0.10, 0.50),
        "meta/llama-2-7b-chat": (0.05, 0.25),
        "mistralai/mistral-7b-v0.1": (0.05, 0.25),
        "mistralai/mistral-7b-instruct-v0.2": (0.05, 0.25),
        "mistralai/mixtral-8x7b-instruct-v0.1": (0.30, 1.00),
    }

    if model not in pricing:
        raise ValueError(f"Unsupported model: {model}")

    input_cost_per_million, output_cost_per_million = pricing[model]

    input_cost = input_tokens * input_cost_per_million / 1_000_000
    output_cost = output_tokens * output_cost_per_million / 1_000_000

    return input_cost + output_cost


def calculate_price(hardware: str, duration: float):
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
        return 0.0


async def run_replicate(
    context: ProcessingContext,
    node_type: str,
    node_id: str,
    model_id: str,
    input_params: dict,
    hardware: str,
):
    replicate = Environment.get_replicate_client()

    log.info(f"Running model {model_id} with input {input_params}")
    started_at = datetime.now()

    context.post_message(
        NodeUpdate(
            node_id=node_id,
            node_name=model_id,
            status="starting",
            started_at=started_at.isoformat(),
        )
    )

    # Split model_version into owner, name, version in format owner/name:version
    match = re.match(r"^(?P<owner>[^/]+)/(?P<name>[^:]+):(?P<version>.+)$", model_id)
    if not match:
        raise ValueError(
            f"Invalid model_version: {model_id}. Expected format: owner/name:version"
        )

    owner = match.group("owner")
    name = match.group("name")
    version_id = match.group("version")

    replicate_pred = replicate.predictions.create(
        version=version_id,
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

        print(replicate_pred)

        if replicate_pred.status != current_status:
            log.info(f"Prediction status: {replicate_pred.status}")
            current_status = replicate_pred.status

        if replicate_pred.metrics:
            predict_time = replicate_pred.metrics["predict_time"]
            cost = calculate_price(hardware, predict_time)
        else:
            predict_time = 0
            cost = 0

        await context.update_prediction(
            id=prediction.id,
            completed_at=datetime.now(),
            error=replicate_pred.error,
            status=replicate_pred.status,
            logs=replicate_pred.logs,
            duration=predict_time,
            cost=cost,
        )

        if replicate_pred.status in ("succeeded", "failed", "canceled"):
            return replicate_pred

        await asyncio.sleep(1)


async def convert_output_value(value: Any, t: Type[Any]):
    """
    Converts the output value to the specified type.

    Args:
        value (Any): The value to be converted.
        t (Type[Any]): The target type to convert the value to.

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
            return t(uri=str(value[0])).model_dump()
        elif type(value) == dict:
            return t(**value).model_dump()
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
    if isinstance(value, Enum):
        return value.value
    return value


class ReplicateNode(BaseNode):
    def replicate_model_id(self) -> str:
        raise NotImplementedError()

    def get_hardware(self) -> str:
        return ""

    async def run_replicate(
        self, context: ProcessingContext, params: Optional[dict[(str, Any)]] = None
    ) -> ReplicatePrediction | None:
        """
        Run prediction on Replicate.
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
            node_id=self.id,
            node_type=self.get_node_type(),
            model_id=self.replicate_model_id(),
            input_params=input_params,
            hardware=self.get_hardware(),
        )

    async def extra_params(self, context: ProcessingContext) -> dict:
        return {}

    async def process(self, context: ProcessingContext):
        params = await self.extra_params(context)
        pred = await self.run_replicate(context, params)
        if pred is None:
            raise ValueError("Prediction failed")
        return pred.output

    async def convert_output(self, context: ProcessingContext, output: Any) -> Any:
        t = self.return_type()
        if isinstance(t, dict):
            return output
        if isinstance(t, Type):
            output = await convert_output_value(output, t)
        return {
            "output": output,
        }


class ValidationError(BaseModel):
    loc: List[Union[str, int]] = Field(..., title="Location")
    msg: str = Field(..., title="Message")
    type: str = Field(..., title="Error Type")


class StatusEnum(str, Enum):
    starting = "starting"
    processing = "processing"
    succeeded = "succeeded"
    canceled = "canceled"
    failed = "failed"


class Status(BaseModel):
    type: StatusEnum = Field(..., title="Status", description="An enumeration.")


class WebhookEventEnum(str, Enum):
    start = "start"
    output = "output"
    logs = "logs"
    completed = "completed"


class WebhookEvent(BaseModel):
    type: WebhookEventEnum = Field(
        ..., title="WebhookEvent", description="An enumeration."
    )


class PredictionRequest(BaseModel):
    id: Optional[str]
    input: Any
    webhook: Optional[str]
    created_at: Optional[str]
    output_file_prefix: Optional[str]
    webhook_events_filter: Optional[List[WebhookEvent]]


class PredictionResponse(BaseModel):
    id: Optional[str] = Field("", title="Id")
    logs: Optional[str] = Field("", title="Logs")
    error: Optional[str] = Field("", title="Error")
    input: Any = Field(None, title="Input")
    output: Optional[Any] = Field(None, title="Output")
    status: Optional[Status] = Field(..., title="Status")
    metrics: Optional[dict] = Field(..., title="Metrics")
    version: Optional[str] = Field(..., title="Version")
    created_at: Optional[str] = Field(
        ...,
        title="Created At",
    )
    started_at: Optional[str] = Field(..., title="Started At")
    completed_at: Optional[str] = Field(..., title="Completed At")


def create_enum_from_schema(name: str, schema: Schema):
    """
    Creates an enum from a schema with an enum field.

    Args:
        name (str): The name of the enum.
        schema (Schema): The schema containing the enum field.

    Returns:
        Enum: The created enum.

    Raises:
        ValueError: If the schema has no enum field.
    """
    if schema.enum is not None:
        # Create the Enum
        return Enum(name, {str(value): value for value in schema.enum})
    else:
        raise ValueError("Schema has no enum field")


def convert_datatype_to_type(datatype: DataType | list[DataType]) -> type:
    """
    Converts an OpenAPI property schema to a Pydantic field.

    Args:
        datatype (DataType | list[DataType]): The datatype or list of datatypes to convert.

    Returns:
        type: The type of the field.

    Raises:
        ValueError: If the datatype is a list.

    """
    if isinstance(datatype, list):
        raise ValueError("Cannot convert list of datatypes to type")
    if datatype == DataType.STRING:
        return str
    elif datatype == DataType.NUMBER:
        return float
    elif datatype == DataType.INTEGER:
        return int
    elif datatype == DataType.BOOLEAN:
        return bool
    elif datatype == DataType.ARRAY:
        return list
    elif datatype == DataType.OBJECT:
        return dict
    else:
        raise ValueError(f"Unknown type: {datatype}")


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


def create_model_from_schema(
    model_name: str,
    schema: Schema,
    type_lookup: dict[str, type],
    base: type[BaseNode],
    module: str,
    skip: list[str] = [],
    overrides: dict[str, tuple[type, Any]] = {},  # type: ignore
) -> type[BaseModel]:
    """
    Create a pydantic model from a openapi schema.

    Args:
        model_name (str): The class name of the model.
        schema (Schema): The schema object.
        type_lookup (dict[str, type]): A dictionary mapping type names to their corresponding Python types.
        base (type[Node]): The base type of the model.
        module (str): The module name.
        skip (list[str], optional): A list of fields to skip. Defaults to [].
        overrides (dict[str, type], optional): A dictionary of field overrides. Defaults to {}.

    Returns:
        type[BaseModel]: The created model.

    Raises:
        ValueError: If the schema has no properties.
        ValueError: If the allOf type cannot be handled.
    """

    fields = {}

    if not schema.properties:
        raise ValueError("Schema has no properties")

    for name, prop in schema.properties.items():
        if name == "api_key":
            continue

        if name in skip:
            continue

        if name in overrides:
            fields[name] = overrides[name]
            continue

        # Skip reference types
        if isinstance(prop, Reference):
            continue

        kwargs: dict[str, Any] = {
            "title": prop.title,
            "description": prop.description,
        }
        if prop.minimum:
            kwargs["ge"] = prop.minimum
        if prop.maximum:
            kwargs["le"] = prop.maximum

        default = prop.default or default_for(prop.type)
        field = Field(default, **kwargs)

        if prop.type:
            fields[name] = (convert_datatype_to_type(prop.type), field)
        elif prop.allOf:
            ref_type = prop.allOf[0]
            if hasattr(ref_type, "ref"):
                ref = ref_type.ref  # type: ignore
                type_ = type_lookup[ref]
                fields[name] = (type_, field)

    assert schema.title
    return create_model(model_name, __base__=base, __module__=module, **fields)


def parse_model_info(url: str):
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


def get_model_api(
    model_id: str, model_version: str | None = None
) -> tuple[OpenAPIv3, str, str, dict[str, Any]]:
    """
    Retrieves the API specification for a specific model and version from the Replicate API.
    """
    model_name = model_id.replace("/", "_").replace("-", "_").replace(".", "_")
    try:
        mod = import_module(f"nodetool.nodes.replicate.models.{model_name}")
        return parse_obj(mod.schema), mod.model_id, mod.model_version, mod.model_info
    except ImportError as e:
        print(e)

        if "REPLICATE_API_TOKEN" not in os.environ:
            raise ValueError(f"model not found: {model_name}")

        headers = {
            "Authorization": "Token " + Environment.get_replicate_api_token(),
        }

        log.info("Getting model API: %s", model_id)

        model_info = parse_model_info(f"https://replicate.com/{model_id}")

        if model_version is None:
            res = httpx.get(
                f"https://api.replicate.com/v1/models/{model_id}/versions",
                headers=headers,
            )
            res.raise_for_status()
            data = res.json()
            schema = data["results"][0]["openapi_schema"]
            api = parse_obj(schema)
            model_version = data["results"][0]["id"]
            assert model_version, "Model version not found"
        else:
            res = httpx.get(
                f"https://api.replicate.com/v1/models/{model_id}/versions/{model_version}",
                headers=headers,
            )
            res.raise_for_status()
            data = res.json()
            schema = data["openapi_schema"]
            api = parse_obj(schema)

        # Save the API specification to the cache file
        cache_file = os.path.join(model_cache_folder, f"{model_name}.py")
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(f"schema = {schema}\n")
            f.write(f"model_id = '{model_id}'\n")
            f.write(f"model_version = '{model_version}'\n")
            f.write(f"model_info = {model_info}\n")

        return api, model_id, model_version, model_info


def replicate_node(
    node_name: str,
    namespace: str,
    model_id: str,
    return_type: Type,
    model_version: str | None = None,
    overrides: dict[str, tuple[type, Any]] = {},  # type: ignore
    skip: list[str] = [],
) -> type[ReplicateNode]:
    """
    Creates a node from a model ID and version.
    Gets the model from the replicate API and creates a node class from it.
    The node class is then added to the NODE_TYPES list.

    Args:
        node_name (str): The name of the node.
        namespace (str): The namespace of the node.
        model_id (str): The ID of the model on replicate.
        model_version (str, optional): The version of the model. Defaults to None.
        overrides (dict[str, type]): A dictionary of overrides for the node fields.
        process (Callable[[Node, ProcessingContext], Any]): A callable function for processing the node.

    Returns:
        ReplicateNode: The generated node class.

    Raises:
        ValueError: If the schema has no properties or enum.
    """

    type_lookup = {}

    api, model_id, model_version, model_info = get_model_api(model_id, model_version)

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
            model = create_enum_from_schema(name, schema)  # type: ignore
            type_lookup[f"#/components/schemas/{name}"] = model

    model = create_model_from_schema(
        model_name=node_name,
        schema=api.components.schemas["Input"],  # type: ignore
        type_lookup=type_lookup,
        base=ReplicateNode,
        module="nodetool.nodes." + namespace,
        overrides=overrides,
        skip=skip,
    )

    def get_namespace(cls):
        return namespace

    def ret_type(cls):
        return return_type

    def get_hardware(cls):
        return model_info.get("hardware", "None")

    # define method on the model class
    def replicate_model_id(self) -> str:
        return f"{model_id}:{model_version}"

    model.replicate_model_id = replicate_model_id  # type: ignore
    model.return_type = classmethod(ret_type)  # type: ignore
    model.get_namespace = classmethod(get_namespace)  # type: ignore
    model.get_hardware = classmethod(get_hardware)  # type: ignore

    return model  # type: ignore


replicate_node(
    node_name="AdInpaintNode",
    namespace="replicate.image.generate",
    model_id="logerzhu/ad-inpaint",
    return_type=ImageRef,
    overrides={
        "image_path": (
            ImageRef,
            Field(ImageRef(), description="Image to inpaint"),
        ),
    },
)

replicate_node(
    model_id="lucataco/proteus-v0.4",
    node_name="ProteusNode",
    namespace="replicate.image.generate",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
        "mask": (
            ImageRef,
            Field(ImageRef(), description="mask to apply"),
        ),
    },
)

replicate_node(
    node_name="SDXLClipInterrogatorNode",
    namespace="replicate.image.analyze",
    model_id="lucataco/sdxl-clip-interrogator",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to interrogate"),
        ),
    },
)


replicate_node(
    model_id="lucataco/moondream2",
    namespace="replicate.image.analyze",
    node_name="Moondream2Node",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to analyze"),
        ),
    },
)

replicate_node(
    model_id="abiruyt/text-extract-ocr",
    node_name="TextExtractOCRNode",
    namespace="replicate.image.ocr",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    model_id="mickeybeurskens/latex-ocr",
    node_name="LatexOCRNode",
    namespace="replicate.image.ocr",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    model_id="fofr/face-to-many",
    node_name="FaceToManyNode",
    namespace="replicate.image.face",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    model_id="tencentarc/photomaker",
    node_name="PhotoMakerNode",
    namespace="replicate.image.face",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    model_id="fofr/face-to-sticker",
    node_name="FaceToStickerNode",
    namespace="replicate.image.face",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)


replicate_node(
    node_name="Blip2Node",
    namespace="replicate.image.analyze",
    model_id="andreasjansson/blip-2",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to analyze"),
        ),
    },
)

replicate_node(
    node_name="Llava13bNode",
    namespace="replicate.image.analyze",
    model_id="yorickvp/llava-13b",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to analyze"),
        ),
    },
)

replicate_node(
    node_name="RealEsrGanNode",
    namespace="replicate.image.upscale",
    model_id="nightmareai/real-esrgan",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to enhance"),
        ),
    },
)

replicate_node(
    node_name="Maxim",
    model_id="google-research/maxim",
    namespace="replicate.image.enhance",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to enhance"),
        ),
    },
)

replicate_node(
    node_name="SwinIRNode",
    namespace="replicate.image.upscale",
    model_id="jingyunliang/swinir",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to enhance"),
        ),
    },
)

replicate_node(
    node_name="BecomeImageNode",
    namespace="replicate.image.generate",
    model_id="fofr/become-image",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to transform"),
        ),
        "image_to_become": (
            ImageRef,
            Field(ImageRef(), description="image to become"),
        ),
    },
)

replicate_node(
    model_id="lucataco/sdxl-inpainting",
    node_name="StableDiffusionInpaintingNode",
    namespace="replicate.image.generate",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to inpaint"),
        ),
    },
)

replicate_node(
    model_id="lucataco/juggernaut-xl-v9",
    node_name="JuggernautXLV9Node",
    namespace="replicate.image.generate",
    return_type=ImageRef,
)

replicate_node(
    model_id="lucataco/dreamshaper-xl-lightning",
    node_name="DreamshaperXLLightningNode",
    namespace="replicate.image.generate",
    return_type=ImageRef,
)

replicate_node(
    node_name="RealVisXLV3Node",
    namespace="replicate.image.generate",
    model_id="fofr/realvisxl-v3-multi-controlnet-lora",
    return_type=ImageRef,
)

replicate_node(
    node_name="OldPhotosRestorationNode",
    namespace="replicate.image.enhance",
    model_id="microsoft/bringing-old-photos-back-to-life",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to restore"),
        ),
    },
)

replicate_node(
    node_name="KandinskyNode",
    namespace="replicate.image.generate",
    model_id="ai-forever/kandinsky-2.2",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    node_name="StableDiffusionXLLightningNode",
    namespace="replicate.image.generate",
    model_id="bytedance/sdxl-lightning-4step",
    return_type=ImageRef,
)


replicate_node(
    node_name="PlaygroundV2Node",
    namespace="replicate.image.generate",
    model_id="playgroundai/playground-v2-1024px-aesthetic",
    return_type=ImageRef,
)

replicate_node(
    node_name="HotshotXLNode",
    namespace="replicate.video.generate",
    model_id="lucataco/hotshot-xl",
    return_type=VideoRef,
)

replicate_node(
    node_name="AnimateDiffNode",
    namespace="replicate.video.generate",
    model_id="zsxkib/animate-diff",
    return_type=VideoRef,
)

replicate_node(
    node_name="ControlNetNode",
    namespace="replicate.image.generate",
    model_id="rossjillian/controlnet",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for controlnet"),
        ),
    },
)

replicate_node(
    node_name="IllusionNode",
    namespace="replicate.image.generate",
    model_id="andreasjansson/illusion",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for illusion"),
        ),
    },
)

replicate_node(
    model_id="daanelson/minigpt-4",
    node_name="MiniGPT4Node",
    namespace="replicate.text.generate",
    return_type=str,
)

replicate_node(
    model_id="yorickvp/llava-v1.6-34b",
    node_name="Llava34BNode",
    namespace="replicate.image.analyze",
    return_type=str,
)

replicate_node(
    model_id="lucataco/qwen-vl-chat",
    node_name="QwenVLChatNode",
    namespace="replicate.text.generate",
    return_type=str,
)

replicate_node(
    model_id="cjwbw/internlm-xcomposer",
    node_name="InternLMXComposerNode",
    namespace="replicate.text.generate",
    return_type=str,
)

replicate_node(
    model_id="yorickvp/llava-v1.6-mistral-7b",
    node_name="LlavaMistral7BNode",
    namespace="replicate.text.generate",
    return_type=str,
)

replicate_node(
    node_name="MaterialStableDiffusionNode",
    namespace="replicate.image.generate",
    model_id="tommoore515/material_stable_diffusion",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for material stable diffusion"),
        ),
    },
)

replicate_node(
    node_name="LlamaEmbeddingsNode",
    namespace="replicate.text.embedding",
    model_id="andreasjansson/llama-2-13b-embeddings",
    return_type=Tensor,
)

replicate_node(
    node_name="Gemma7BNode",
    namespace="replicate.text.generate",
    model_id="google-deepmind/gemma-7b-it",
    return_type=str,
)

replicate_node(
    model_id="openai/whisper",
    node_name="WhisperNode",
    namespace="replicate.audio.transcribe",
    return_type=AudioRef,
    overrides={
        "audio": (
            AudioRef,
            Field(AudioRef(), description="audio to analyze"),
        ),
    },
)

replicate_node(
    node_name="AudioSuperResolutionNode",
    namespace="replicate.audio.enhance",
    model_id="nateraw/audio-super-resolution",
    return_type=AudioRef,
    overrides={
        "input_file": (
            AudioRef,
            Field(AudioRef(), description="audio file to super resolve"),
        ),
    },
)

replicate_node(
    node_name="Fuyu8BNode",
    namespace="replicate.image.analyze",
    model_id="lucataco/fuyu-8b",
    return_type=str,
)

replicate_node(
    node_name="LatentConsistencyModelNode",
    namespace="replicate.image.generate",
    model_id="luosiallen/latent-consistency-model",
    skip=["num_images"],
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
    },
)

replicate_node(
    node_name="RemoveBackgroundNode",
    namespace="replicate.image.process",
    model_id="cjwbw/rembg",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for rembg"),
        ),
    },
)

replicate_node(
    node_name="ModNetNode",
    namespace="replicate.image.process",
    model_id="pollinations/modnet",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for modnet"),
        ),
    },
)


replicate_node(
    node_name="CodeFormerNode",
    namespace="replicate.image.enhance",
    model_id="lucataco/codeformer",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
    },
)

replicate_node(
    node_name="RealisticVoiceCloningNode",
    namespace="replicate.audio.generate",
    model_id="zsxkib/realistic-voice-cloning",
    return_type=AudioRef,
    overrides={
        "song_input": (
            AudioRef,
            Field(AudioRef(), description="audio file for voice cloning"),
        ),
    },
)

replicate_node(
    node_name="VideoLlavaNode",
    namespace="replicate.video.analyze",
    model_id="nateraw/video-llava",
    return_type=str,
    overrides={
        "video_path": (
            VideoRef,
            Field(VideoRef(), description="video input"),
        ),
        "image_path": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
    },
)

replicate_node(
    node_name="StableDiffusionXLLCMControlnetNode",
    namespace="replicate.image.generate",
    model_id="fofr/sdxl-lcm-multi-controlnet-lora",
    model_version="750b7665e4eb1c02f65f374317e3d8dfe690ee42f3101a9c686cfd6d533534b7",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
        "mask": (
            ImageRef,
            Field(ImageRef(), description="mask input"),
        ),
        "controlnet_1_image": (
            ImageRef,
            Field(ImageRef(), description="controlnet 1 image input"),
        ),
        "controlnet_2_image": (
            ImageRef,
            Field(ImageRef(), description="controlnet 2 image input"),
        ),
        "controlnet_3_image": (
            ImageRef,
            Field(ImageRef(), description="controlnet 3 image input"),
        ),
    },
)
MODEL_VERSIONS = {}


def get_model_version(model: str) -> str:
    version = MODEL_VERSIONS.get(model, None)
    if version:
        return version

    headers = {
        "Authorization": "Token " + Environment.get_replicate_api_token(),
    }

    res = httpx.get(
        f"https://api.replicate.com/v1/models/{model}/versions",
        headers=headers,
    )
    res.raise_for_status()
    data = res.json()
    model_version = data["results"][0]["id"]

    assert model_version, "Model version not found"

    MODEL_VERSIONS[model] = model_version

    return model_version
