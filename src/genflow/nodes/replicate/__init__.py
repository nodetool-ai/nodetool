import json
import os
import httpx
import asyncio
import re

from datetime import datetime
from typing import Any, List, Optional, Type, Union, get_origin
from openapi_pydantic.v3 import (
    parse_obj,
    DataType,
    Schema,
    Reference,
)
from importlib import import_module
from enum import Enum
from pydantic import BaseModel, Field, create_model
from enum import Enum
from replicate.prediction import Prediction as ReplicatePrediction
from genflow.common.environment import Environment
from genflow.workflows.types import NodeUpdate
from genflow.workflows.genflow_node import GenflowNode, add_node_type
from genflow.metadata.types import Tensor
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.metadata.types import VideoRef
from genflow.models.prediction import Prediction


log = Environment.get_logger()


current_folder = os.path.dirname(os.path.abspath(__file__))
model_cache_folder = os.path.join(current_folder, "models")


async def run_replicate(
    context: ProcessingContext,
    node_type: str,
    node_id: str,
    model_id: str,
    raw_inputs: dict,
    input_params: dict,
):
    replicate = Environment.get_replicate_client()

    log.info(f"Running model {model_id} with input {input_params}")
    started_at = datetime.now()

    context.post_message(
        NodeUpdate(
            node_id=node_id, status="starting", started_at=started_at.isoformat()
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
    # api_url = Environment.get_replicate_webhook_url()

    replicate_pred = replicate.predictions.create(
        version=version_id,
        input=input_params,
        # webhook=f"{api_url}/api/predictions/",
    )

    prediction = Prediction.create(
        id=replicate_pred.id,
        model=f"{owner}/{name}",
        version=version_id,
        node_id=node_id,
        node_type=node_type,
        user_id=context.user_id,
        workflow_id=context.workflow_id if context.workflow_id != "" else None,
        input=raw_inputs,
        output=None,
        error=None,
        status="starting",
        created_at=datetime.now(),
        started_at=None,
        completed_at=None,
        metrics={},
    )

    context.post_message(prediction)

    current_status = "starting"

    for i in range(12 * 3600):
        replicate_pred = replicate.predictions.get(replicate_pred.id)

        if replicate_pred.status != current_status:
            log.info(f"Prediction status: {replicate_pred.status}")
            current_status = replicate_pred.status

        prediction.update(
            completed_at=datetime.now(),
            output=replicate_pred.output,
            error=replicate_pred.error,
            status=replicate_pred.status,
            metrics=replicate_pred.metrics,
            logs=replicate_pred.logs,
        )

        if replicate_pred.status != "starting":
            context.post_message(prediction)

        if replicate_pred.status in ("succeeded", "failed", "canceled"):
            log.info(f"Prediction logs: {replicate_pred.logs}")
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


class ReplicateNode(GenflowNode):
    def replicate_model_id(self) -> str:
        raise NotImplementedError()

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
            raw_inputs=raw_inputs,
            input_params=input_params,
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
    base: type[GenflowNode],
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


def get_model_api(model_id: str, model_version: str):
    """
    Retrieves the API specification for a specific model and version from the Replicate API.

    Args:
        model_id (str): The ID of the model.
        model_version (str): The version of the model.

    Returns:
        OpenAPIv3: The API specification
    """
    model_name = model_id.replace("/", "_").replace("-", "_").replace(".", "_")
    try:
        mod = import_module(f"genflow.nodes.replicate.models.{model_name}")
        return parse_obj(mod.schema)
    except ImportError as e:
        print(e)

        if "REPLICATE_API_TOKEN" not in os.environ:
            raise ValueError(f"model not found: {model_name}")

        headers = {
            "Authorization": "Token " + Environment.get_replicate_api_token(),
        }

        log.info("Getting model API: %s:%s", model_id, model_version)

        url = f"https://api.replicate.com/v1/models/{model_id}/versions/{model_version}"
        res = httpx.get(url, headers=headers).json()
        api = parse_obj(res["openapi_schema"])

        # Save the API specification to the cache file
        cache_file = os.path.join(model_cache_folder, f"{model_name}.py")
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(f"schema = {res['openapi_schema']}")

        return api


def replicate_node(
    node_name: str,
    namespace: str,
    model_id: str,
    model_version: str,
    return_type: Type,
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
        model_version (str): The version of the model.
        overrides (dict[str, type]): A dictionary of overrides for the node fields.
        process (Callable[[Node, ProcessingContext], Any]): A callable function for processing the node.

    Returns:
        ReplicateNode: The generated node class.

    Raises:
        ValueError: If the schema has no properties or enum.
    """

    type_lookup = {}

    api = get_model_api(model_id, model_version)

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

        if hasattr(schema, "enum"):
            model = create_enum_from_schema(name, schema)  # type: ignore
            type_lookup[f"#/components/schemas/{name}"] = model

    model = create_model_from_schema(
        model_name=node_name,
        schema=api.components.schemas["Input"],  # type: ignore
        type_lookup=type_lookup,
        base=ReplicateNode,
        module="genflow.nodes." + namespace,
        overrides=overrides,
        skip=skip,
    )

    def get_namespace(cls):
        return namespace

    def ret_type(cls):
        return return_type

    # define method on the model class
    def replicate_model_id(self) -> str:
        return f"{model_id}:{model_version}"

    model.replicate_model_id = replicate_model_id  # type: ignore
    model.return_type = classmethod(ret_type)  # type: ignore
    model.get_namespace = classmethod(get_namespace)  # type: ignore

    return model  # type: ignore


replicate_node(
    node_name="AdInpaintNode",
    namespace="replicate.image.generate",
    model_id="logerzhu/ad-inpaint",
    model_version="b1c17d148455c1fda435ababe9ab1e03bc0d917cc3cf4251916f22c45c83c7df",
    return_type=ImageRef,
    overrides={
        "image_path": (
            ImageRef,
            Field(ImageRef(), description="Path to the image to inpaint"),
        ),
    },
)

replicate_node(
    node_name="SDXLClipInterrogatorNode",
    namespace="replicate.image.analyze",
    model_id="lucataco/sdxl-clip-interrogator",
    model_version="d90ed1292165dbad1fc3fc8ce26c3a695d6a211de00e2bb5f5fec4815ea30e4c",
    return_type=str,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to interrogate"),
        ),
    },
)

replicate_node(
    node_name="Blip2Node",
    namespace="replicate.image.analyze",
    model_id="andreasjansson/blip-2",
    model_version="4b32258c42e9efd4288bb9910bc532a69727f9acd26aa08e175713a0a857a608",
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
    model_version="2facb4a474a0462c15041b78b1ad70952ea46b5ec6ad29583c0b29dbd4249591",
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
    model_version="42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
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
    model_version="660d922d33153019e8c263a3bba265de882e7f4f70396546b6c9c8f9d47a021a",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to enhance"),
        ),
    },
)

replicate_node(
    node_name="OldPhotosRestorationNode",
    namespace="replicate.image.enhance",
    model_id="microsoft/bringing-old-photos-back-to-life",
    model_version="c75db81db6cbd809d93cc3b7e7a088a351a3349c9fa02b6d393e35e0d51ba799",
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
    model_version="ea1addaab376f4dc227f5368bbd8eff901820fd1cc14ed8cad63b29249e9d463",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image to process"),
        ),
    },
)

replicate_node(
    node_name="StableDiffusionHighResolutionNode",
    namespace="replicate.image.generate",
    model_id="cjwbw/stable-diffusion-high-resolution",
    model_version="231e401da17b34aac8f8b3685f662f7fdad9ce1cf504ec0828ba4aac19f7882f",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(
                ImageRef(),
                description="image for stable diffusion high resolution",
            ),
        ),
    },
)

replicate_node(
    node_name="PlaygroundV2Node",
    namespace="replicate.image.generate",
    model_id="playgroundai/playground-v2-1024px-aesthetic",
    model_version="42fe626e41cc811eaf02c94b892774839268ce1994ea778eba97103fe1ef51b8",
    return_type=ImageRef,
)

replicate_node(
    node_name="HotshotXLNode",
    namespace="replicate.video.generate",
    model_id="lucataco/hotshot-xl",
    model_version="b57dddff6ae2029be57eab3d17e0de5f1c83b822f0defd8ce49bee44d7b52ee6",
    return_type=VideoRef,
)

replicate_node(
    node_name="AnimateDiffNode",
    namespace="replicate.video.generate",
    model_id="zsxkib/animate-diff",
    model_version="269a616c8b0c2bbc12fc15fd51bb202b11e94ff0f7786c026aa905305c4ed9fb",
    return_type=VideoRef,
)

replicate_node(
    node_name="ControlNetNode",
    namespace="replicate.image.generate",
    model_id="rossjillian/controlnet",
    model_version="795433b19458d0f4fa172a7ccf93178d2adb1cb8ab2ad6c8fdc33fdbcd49f477",
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
    model_version="75d51a73fce3c00de31ed9ab4358c73e8fc0f627dc8ce975818e653317cb919b",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for illusion"),
        ),
    },
)

replicate_node(
    node_name="MaterialStableDiffusionNode",
    namespace="replicate.image.generate",
    model_id="tommoore515/material_stable_diffusion",
    model_version="3b5c0242f8925a4ab6c79b4c51e9b4ce6374e9b07b5e8461d89e692fd0faa449",
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
    model_version="7115a4c65b86815e31412e53de1211c520164c190945a84c425b59dccbc47148",
    return_type=Tensor,
)

replicate_node(
    node_name="AudioSuperResolutionNode",
    namespace="replicate.audio.enhance",
    model_id="nateraw/audio-super-resolution",
    model_version="9c3d3e39fb0cb6aea677264881d8073f835336137b39fdea4e94093319379535",
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
    model_version="42f23bc876570a46f5a90737086fbc4c3f79dd11753a28eaa39544dd391815e9",
    return_type=str,
)

replicate_node(
    node_name="LatentConsistencyModelNode",
    namespace="replicate.image.generate",
    model_id="luosiallen/latent-consistency-model",
    model_version="553803fd018b3cf875a8bc774c99da9b33f36647badfd88a6eec90d61c5f62fc",
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
    model_version="fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
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
    model_version="da7d45f3b836795f945f221fc0b01a6d3ab7f5e163f13208948ad436001e2255",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image for modnet"),
        ),
    },
)

replicate_node(
    node_name="T2IAdapterSDXLOpenPoseNode",
    namespace="replicate.image.generate",
    model_id="alaradirik/t2i-adapter-sdxl-openpose",
    model_version="ff250494f7328552c64ee50ae3ed9b61e09ca18c7aa51f77ed187a3fb9ec9093",
    return_type=ImageRef,
    overrides={
        "image": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
    },
)

replicate_node(
    node_name="CodeFormerNode",
    namespace="replicate.image.enhance",
    model_id="lucataco/codeformer",
    model_version="78f2bab438ab0ffc85a68cdfd316a2ecd3994b5dd26aa6b3d203357b45e5eb1b",
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
    model_version="0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550",
    return_type=AudioRef,
    overrides={
        "song_input": (
            AudioRef,
            Field(AudioRef(), description="audio file for voice cloning"),
        ),
    },
)

replicate_node(
    node_name="StableVideoDiffusionNode",
    namespace="replicate.video.generate",
    model_id="stability-ai/stable-video-diffusion",
    model_version="3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    return_type=VideoRef,
    overrides={
        "input_image": (
            ImageRef,
            Field(ImageRef(), description="image input"),
        ),
    },
)

replicate_node(
    node_name="VideoLlavaNode",
    namespace="replicate.video.analyze",
    model_id="nateraw/video-llava",
    model_version="a494250c04691c458f57f2f8ef5785f25bc851e0c91fd349995081d4362322dd",
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
    node_name="Yi34BChatNode",
    namespace="replicate.text.generate",
    model_id="01-ai/yi-34b-chat",
    model_version="914692bbe8a8e2b91a4e44203e70d170c9c5ccc1359b283c84b0ec8d47819a46",
    return_type=str,
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

replicate_node(
    node_name="Mixtral8X7BInstructNode",
    namespace="replicate.text.generate",
    model_id="mistralai/mixtral-8x7b-instruct-v0.1",
    model_version="2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e",
    return_type=str,
)
