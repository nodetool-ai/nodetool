import asyncio
from datetime import datetime
from enum import Enum
import json
from queue import Queue
import urllib.parse
import os
import uuid
import httpx
import joblib
import base64
import PIL.Image
import numpy as np
import pandas as pd

from genflow.api.models.graph import Edge
from genflow.api.models.asset import Asset, AssetCreateRequest
from genflow.api.models.models import Prediction
from genflow.models.prediction import Prediction as PredictionModel
from genflow.workflows.types import (
    NodeProgress,
    NodeUpdate,
    ProcessingMessage,
    WorkflowUpdate,
)
from genflow.workflows.run_job_request import RunJobRequest
from genflow.storage.abstract_storage import AbstractStorage
from genflow.metadata.types import (
    AssetRef,
    AudioRef,
    DataFrame,
    ImageRef,
    ModelRef,
    TextRef,
    VideoRef,
)
from genflow.common.environment import Environment
from genflow.common.genflow_api_client import GenflowAPIClient
from genflow.workflows.genflow_node import GenflowNode
from genflow.workflows.property import Property
from genflow.models.asset import Asset as AssetModel
from genflow.metadata.types import ImageRef
from genflow.common.environment import Environment


from io import BytesIO
from typing import IO, Any


log = Environment.get_logger()


def parse_s3_url(url: str) -> tuple[str, str]:
    """
    Parses an S3 URL into a bucket and object key.
    """
    parsed_url = urllib.parse.urlparse(url)
    bucket = parsed_url.netloc
    key = parsed_url.path.lstrip("/")
    return bucket, key


class ProcessingContext:
    """
    The processing context is the workflow's interface to the outside world.
    It maintains the state of the workflow and provides methods for interacting with the environment.

    Initialization and State Management:
    - Initializes the context with user ID, authentication token, workflow ID, graph edges, nodes, capabilities, and a message queue.
    - Manages the results of processed nodes and keeps track of processed nodes.
    - Provides methods for popping and posting messages to the message queue.

    Asset Management:
    - Provides methods for finding, downloading, and creating assets (images, audio, text, video, dataframes, models).
    - Handles conversions between different asset formats (e.g., PIL Image to ImageRef, numpy array to ImageRef).
    - Generates presigned URLs for accessing assets.

    API and Storage Integration:
    - Interacts with the GenFlow API client for asset-related operations.
    - Retrieves and manages asset storage and temporary storage instances.
    - Handles file uploads and downloads to/from storage services.

    Workflow Execution:
    - Runs the workflow by sending a RunJobRequest to a remote worker.
    - Processes and handles various types of messages received from the worker (node progress, updates, errors).

    Utility Methods:
    - Provides helper methods for converting values for prediction, handling enums, and parsing S3 URLs.
    - Supports data conversion between different formats (e.g., TextRef to string, DataFrame to pandas DataFrame).

    """

    user_id: str
    auth_token: str
    workflow_id: str
    capabilities: list[str]
    edges: list[Edge]
    nodes: list[GenflowNode]
    results: dict[str, Any]
    processed_nodes: set[str]
    message_queue: Queue | asyncio.Queue

    def __init__(
        self,
        user_id: str,
        auth_token: str = "",
        workflow_id: str = "",
        edges: list[Edge] | None = None,
        nodes: list[GenflowNode] | None = None,
        queue: Queue | asyncio.Queue | None = None,
        capabilities: list[str] | None = None,
    ):
        self.user_id = user_id
        self.auth_token = auth_token
        self.workflow_id = workflow_id
        self.edges = edges if edges is not None else []
        self.nodes = nodes if nodes is not None else []
        self.results = {}
        self.processed_nodes = set()
        self.message_queue = queue if queue is not None else asyncio.Queue()
        self.capabilities = capabilities if capabilities is not None else []

    async def pop_message_async(self) -> ProcessingMessage:
        assert isinstance(self.message_queue, asyncio.Queue)
        return await self.message_queue.get()

    def pop_message(self) -> ProcessingMessage:
        assert isinstance(self.message_queue, Queue)
        return self.message_queue.get()

    def post_message(self, message: ProcessingMessage):
        self.message_queue.put_nowait(message)

    def has_messages(self) -> bool:
        return not self.message_queue.empty()

    def api_client(self) -> GenflowAPIClient:
        assert self.auth_token is not None, "Auth token is required"
        return Environment.get_genflow_api_client(self.auth_token)

    async def find_asset(self, asset_id: str):
        """
        Finds an asset by id.
        """
        if "db" in self.capabilities:
            asset = AssetModel.find(self.user_id, asset_id)
            if asset is None:
                raise ValueError(f"Asset with ID {asset_id} does not exist")
            return asset
        else:
            res = await self.api_client().get(f"assets/{asset_id}")
            return Asset(**res)

    async def get_asset_url(self, asset_id: str):
        """
        Returns the asset url.
        """
        asset = await self.find_asset(asset_id)  # type: ignore

        return self.get_asset_storage().generate_presigned_url(
            "get_object", asset.file_name
        )

    def get_asset_storage(self) -> AbstractStorage:
        """
        Returns the asset service.
        """
        return Environment.get_asset_storage()

    def get_temp_storage(self) -> AbstractStorage:
        """
        Returns the asset service.
        """
        return Environment.get_temp_storage()

    def get_result(self, node_id: str, slot: str) -> Any:
        """
        Get the result of a node.

        Results are stored in the context's results dictionary after a node is processed.
        """
        res = self.results.get(node_id, {})

        if res:
            return res.get(slot, None)
        else:
            return None

    def set_result(self, node_id: str, res: dict[str, Any]):
        """
        Set the result of a node.

        Results are stored in the context's results dictionary after a node is processed.
        """
        self.results[node_id] = res

    def get_node_inputs(self, node_id: str) -> dict[str, Any]:
        """
        Retrieves the inputs for a given node.

        Args:
            node_id (str): The ID of the node.

        Returns:
            dict[str, Any]: A dictionary containing the inputs for the node, where the keys are the input slot names
            and the values are the results from the corresponding source nodes.
        """
        return {
            edge.targetHandle: self.get_result(edge.source, edge.sourceHandle)
            for edge in self.edges
            if edge.target == node_id
        }

    def find_node(self, node_id: str) -> GenflowNode:
        """
        Finds a node by its ID.
        Throws ValueError if no node is found.
        """
        for node in self.nodes:
            if node.id == node_id:
                return node
        raise ValueError(f"Node with ID {node_id} does not exist")

    async def update_prediction(
        self,
        id: str,
        status: str | None = None,
        error: str | None = None,
        logs: str | None = None,
        metrics: dict[str, Any] | None = None,
        completed_at: datetime | None = None,
    ) -> Prediction:
        """
        Updates the prediction.
        """
        if "db" in self.capabilities:
            pred = PredictionModel.find(self.user_id, id)
            if pred is None:
                raise ValueError(f"Prediction with ID {id} does not exist")
            if status:
                pred.status = status
            if error:
                pred.error = error
            if logs:
                pred.logs = logs
            if metrics:
                pred.metrics = metrics
            if completed_at:
                pred.completed_at = completed_at
            return Prediction.from_model(pred)
        else:
            res = await self.api_client().put(
                f"predictions/{id}",
                {
                    "status": status,
                    "error": error,
                    "logs": logs,
                    "metrics": metrics,
                    "completed_at": (
                        completed_at.isoformat() if completed_at else None
                    ),
                },
            )
            return Prediction(**res)

    async def create_prediction(
        self,
        node_id: str,
        node_type: str | None = None,
        model: str | None = None,
        version: str | None = None,
        workflow_id: str | None = None,
        status: str | None = None,
    ) -> Prediction:
        if "db" in self.capabilities:
            pred = PredictionModel.create(
                user_id=self.user_id,
                node_id=node_id,
                node_type=node_type if node_type else "",
                model=model if model else "",
                version=version if version else "",
                workflow_id=workflow_id if workflow_id else "",
                status=status if status else "",
            )
            return Prediction.from_model(pred)
        else:
            res = await self.api_client().post(
                "predictions/",
                {
                    "node_id": node_id,
                    "node_type": node_type if node_type else "",
                    "model": model if model else "",
                    "workflow_id": workflow_id if workflow_id else "",
                    "version": version if version else "",
                    "status": status if status else "",
                },
            )
            return Prediction(**res)

    async def create_asset(
        self,
        name: str,
        content_type: str,
        content: IO,
        parent_id: str | None = None,
    ) -> tuple[Any, str]:
        content.seek(0)

        if "db" in self.capabilities:
            asset = AssetModel.create(
                user_id=self.user_id,
                workflow_id=self.workflow_id,
                name=name,
                content_type=content_type,
                parent_id=parent_id,
            )
        else:
            req = AssetCreateRequest(
                workflow_id=self.workflow_id,
                name=name,
                content_type=content_type,
                parent_id=parent_id,
            )
            res = await self.api_client().post("assets/", req.model_dump())
            asset = Asset(**res)

        url = await self.get_asset_storage().upload_async(asset.file_name, content)
        return asset, url

    async def create_temp_file(self, content: IO, ext: str = "") -> str:
        key = uuid.uuid4().hex
        if ext != "":
            key += "." + ext

        return self.get_temp_storage().upload(key, content)

    async def download_asset(self, asset_id: str):
        """
        Downloads an asset.
        """
        asset = await self.find_asset(asset_id)
        stream = BytesIO()
        await self.get_asset_storage().download_async(asset.file_name, stream)
        stream.seek(0)
        return stream

    async def download_file_async(self, url: str) -> IO:
        """
        Download a file from URL.
        If url contains s3.amazonaws.com, it will be downloaded from S3.
        """
        from genflow.common.encoding import decode_bytes_io

        url_parsed = urllib.parse.urlparse(url)

        if url_parsed.scheme == "data":
            file = decode_bytes_io(url.split(",")[1])
            # parse file ext from data uri
            ext = url.split(",")[0].split(";")[0].split("/")[1]
            file.name = f"{uuid.uuid4()}.{ext}"
            return file

        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

        key = os.path.basename(url).split("?")[0]

        return BytesIO(response.content)

    async def to_io(self, asset_ref: AssetRef) -> IO:
        # Asset ID takes precedence over URI
        # as the URI could be expired
        if asset_ref.asset_id is not None:
            return await self.download_asset(asset_ref.asset_id)
        if asset_ref.uri != "":
            endpoint_url = (
                Environment.get_s3_endpoint_url()
                or f"{Environment.get_genflow_api_url()}/storage"
            )
            if endpoint_url and asset_ref.uri.startswith(endpoint_url):
                path = asset_ref.uri.removeprefix(endpoint_url + "/").split("/")
                bucket = path[0]
                key = "/".join(path[1:])

                if bucket == Environment.get_asset_bucket():
                    storage = self.get_asset_storage()
                elif bucket == Environment.get_temp_bucket():
                    storage = self.get_temp_storage()
                else:
                    raise ValueError(f"Invalid bucket: {bucket}")
                stream = BytesIO()
                await storage.download_async(key, stream)
                stream.seek(0)
                return stream

            return await self.download_file_async(asset_ref.uri)
        raise ValueError(f"AssetRef is empty {asset_ref}")

    async def to_pil(self, image_ref: ImageRef) -> PIL.Image.Image:
        """
        Converts the image to a PIL Image object.

        Args:
            context (ProcessingContext): The processing context.
        """
        buffer = await self.to_io(image_ref)
        return PIL.Image.open(buffer).convert("RGB")

    async def refresh_uri(self, asset_ref: AssetRef):
        if asset_ref.asset_id is not None:
            asset_ref.uri = await self.get_asset_url(asset_ref.asset_id)

    async def to_audio_segment(self, audio_ref: AudioRef):
        import pydub

        audio_bytes = await self.to_io(audio_ref)
        return pydub.AudioSegment.from_file(audio_bytes)

    async def audio_from_io(
        self,
        buffer: IO,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "AudioRef":
        """
        Creates an AudioRef from an IO object.

        Args:
            buffer (IO): The IO object.
            name (Optional[str], optional): The name of the asset. Defaults to None
            parent_id (Optional[str], optional): The parent ID of the asset. Defaults to None.

        Returns:
            AudioRef: The AudioRef object.
        """
        if name:
            asset, s3_url = await self.create_asset(
                name, "audio/mp3", buffer, parent_id=parent_id
            )
            return AudioRef(asset_id=asset.id, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer, "mp3")
            return AudioRef(uri=s3_url)

    async def audio_from_bytes(
        self,
        b: bytes,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "AudioRef":
        """
        Creates an AudioRef from a bytes object.

        Args:
            context (ProcessingContext): The processing context.
            b (bytes): The bytes object.
            name (Optional[str], optional): The name of the asset. Defaults to None.

        Returns:
            AudioRef: The AudioRef object.
        """
        return await self.audio_from_io(BytesIO(b), name=name, parent_id=parent_id)

    async def audio_to_numpy(self, audio_ref: AudioRef) -> tuple[np.ndarray, int]:
        audio_segment = await self.to_audio_segment(audio_ref)
        return np.array(audio_segment.get_array_of_samples()), audio_segment.frame_rate

    async def audio_from_segment(
        self,
        audio_segment: "pydub.AudioSegment",  # type: ignore
        name: str | None = None,
        parent_id: str | None = None,
        **kwargs,
    ) -> "AudioRef":
        buffer = BytesIO()
        audio_segment.export(buffer, format="mp3")
        buffer.seek(0)
        if name:
            asset, s3_url = await self.create_asset(
                name, "audio/mp3", buffer, parent_id=parent_id
            )
            return AudioRef(asset_id=asset.id, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer, "mp3")
            return AudioRef(uri=s3_url)

    async def to_pandas(self, df: DataFrame):
        import pandas as pd

        if df.columns:
            return pd.DataFrame(df.data, columns=df.columns)
        else:
            bytes_io = await self.to_io(df)
            return pd.read_csv(bytes_io)

    async def from_pandas(
        self, data: "pd.DataFrame", name: str | None = None
    ) -> "DataFrame":
        buffer = BytesIO()
        data.to_csv(buffer)
        buffer.seek(0)
        if name:
            asset, s3_url = await self.create_asset(name, "text/csv", buffer)
            return DataFrame(asset_id=asset.id, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer)
            return DataFrame(uri=s3_url)

    async def image_from_io(
        self,
        buffer: IO,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "ImageRef":
        """
        Creates an ImageRef from an IO object.

        Args:
            buffer (IO): The IO object.
            name (Optional[str], optional): The name of the asset. Defaults to None
            parent_id (Optional[str], optional): The parent ID of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        if name:
            asset, s3_url = await self.create_asset(
                name=name, content_type="image/png", content=buffer, parent_id=parent_id
            )
            return ImageRef(asset_id=asset.id, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer)
            return ImageRef(uri=s3_url)

    async def image_from_url(
        self,
        url: str,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "ImageRef":
        """
        Creates an ImageRef from a URL.

        Args:
            context (ProcessingContext): The processing context.
            url (str): The URL.
            name (Optional[str], optional): The name of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        return await self.image_from_io(
            await self.download_file_async(url), name=name, parent_id=parent_id
        )

    async def image_from_bytes(
        self,
        b: bytes,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "ImageRef":
        """
        Creates an ImageRef from a bytes object.

        Args:
            context (ProcessingContext): The processing context.
            b (bytes): The bytes object.
            name (Optional[str], optional): The name of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        return await self.image_from_io(BytesIO(b), name=name, parent_id=parent_id)

    async def image_from_base64(
        self,
        b64: str,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "ImageRef":
        """
        Creates an ImageRef from a base64-encoded string.

        Args:
            context (ProcessingContext): The processing context.
            b64 (str): The base64-encoded string.
            name (Optional[str], optional): The name of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        return await self.image_from_bytes(
            base64.b64decode(b64), name=name, parent_id=parent_id
        )

    async def image_from_pil(
        self,
        image: PIL.Image.Image,
        name: str | None = None,
        parent_id: str | None = None,
    ) -> "ImageRef":
        """
        Creates an ImageRef from a PIL Image object.

        Args:
            image (Image.Image): The PIL Image object.
            name (Optional[str], optional): The name of the asset. Defaults to None.
            parent_id (Optional[str], optional): The parent ID of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        buffer = BytesIO()
        image.save(buffer, format="png")
        buffer.seek(0)
        return await self.image_from_io(buffer, name=name, parent_id=parent_id)

    async def image_from_numpy(
        self, image: np.ndarray, name: str | None = None, parent_id: str | None = None
    ) -> "ImageRef":
        """
        Creates an ImageRef from a numpy array.

        Args:
            image (np.ndarray): The numpy array.
            name (Optional[str], optional): The name of the asset. Defaults to None.
            parent_id (Optional[str], optional): The parent ID of the asset. Defaults to None.

        Returns:
            ImageRef: The ImageRef object.
        """
        return await self.image_from_pil(PIL.Image.fromarray(image), name=name)

    async def to_str(self, text_ref: TextRef | str) -> str:
        """
        Converts a TextRef to a string.

        Args:
            text_ref (TextRef): The TextRef object.

        Returns:
            str: The string.
        """
        if isinstance(text_ref, TextRef):
            stream = await self.to_io(text_ref)
            return stream.read().decode("utf-8")
        else:
            return text_ref

    async def text_from_str(
        self,
        s: str,
        name: str | None = None,
        content_type: str = "text/plain",
        parent_id: str | None = None,
    ) -> "TextRef":
        buffer = BytesIO(s.encode("utf-8"))
        if name:
            asset, s3_url = await self.create_asset(
                name, content_type, buffer, parent_id=parent_id
            )
            return TextRef(asset_id=asset, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer)
            return TextRef(uri=s3_url)

    async def video_from_io(
        self,
        buffer: IO,
        name: str | None = None,
        parent_id: str | None = None,
    ):
        """
        Creates an VideoRef from an IO object.

        Args:
            context (ProcessingContext): The processing context.
            buffer (IO): The IO object.
            name (Optional[str], optional): The name of the asset. Defaults to None.

        Returns:
            VideoRef: The VideoRef object.
        """
        if name:
            asset, s3_url = await self.create_asset(
                name, "video/mpeg", buffer, parent_id=parent_id
            )
            return VideoRef(asset_id=asset.id, uri=s3_url)
        else:
            s3_url = await self.create_temp_file(buffer)
            return VideoRef(uri=s3_url)

    async def to_estimator(self, model_ref: ModelRef):
        if model_ref.asset_id is None:
            raise ValueError("ModelRef is empty")
        file = await self.to_io(model_ref)
        return joblib.load(file)

    async def from_estimator(self, est: "BaseEstimator", **kwargs):  # type: ignore
        stream = BytesIO()
        joblib.dump(est, stream)
        stream.seek(0)
        asset, url = await self.create_asset("model", "application/model", stream)

        return ModelRef(uri=url, asset_id=asset.id, **kwargs)

    async def convert_value_for_prediction(
        self,
        property: Property,
        value: Any,
    ):
        """
        Converts the property value for a remote api prediction on replicate or huggingface.

        Args:
            property (Property): The property.
            value: The value to be converted.

        Raises:
            NotImplementedError: If the self type is 'tensor' and not implemented.
            ValueError: If the self value is an invalid enum value.
        """

        if isinstance(value, AssetRef):
            if value.is_empty():
                return None
            io = await self.to_io(value)
            if isinstance(value, TextRef):
                return io.read().decode("utf-8")
            else:
                img_bytes = io.read()
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                if isinstance(value, ImageRef):
                    return "data:image/png;base64," + b64
                elif isinstance(value, AudioRef):
                    return "data:audio/mp3;base64," + b64
                elif isinstance(value, VideoRef):
                    return "data:video/mp4;base64," + b64
                else:
                    return b64
        elif property.type.type == "tensor":
            raise NotImplementedError()
        elif property.type.type == "enum":
            if value is None:
                return None
            elif isinstance(value, str):
                return value
            elif isinstance(value, Enum):
                return value.value
            else:
                raise ValueError(f"Invalid enum value {value}")
        else:
            return value

    async def image_from_openai(self, file_id: str) -> "ImageRef":
        """
        Creates an ImageRef from an OpenAI ImageFile object.

        Args:
            file_id (str): The ID of the file.

        Returns:
            ImageRef: The ImageRef object.
        """
        client = Environment.get_openai_client()
        res = await client.files.content(file_id)
        return await self.image_from_bytes(res.content)

    async def run_worker(self, req: RunJobRequest) -> dict[str, Any]:
        """
        Runs the workflow using the provided graph and parameters.

        Args:
            graph (Graph): The graph representing the workflow.
            params (dict, optional): Additional parameters for the workflow. Defaults to {}.

        Returns:
            dict[str, Any]: The result of running the workflow.
        """

        # TODO: logic to determine which worker to use for given workflow

        url = Environment.get_worker_url()
        assert url is not None, "Worker URL is required"
        assert self.auth_token is not None, "Auth token is required"

        req.auth_token = self.auth_token
        req.user_id = self.user_id

        headers = {
            "Content-Type": "application/json",
        }

        client = httpx.AsyncClient(timeout=600)
        if req.env is None:
            req.env = {}

        if not Environment.is_production():
            api_tunnel_url = Environment.get_api_tunnel_url()
            req.env["GENFLOW_API_URL"] = api_tunnel_url
            req.env["S3_ENDPOINT_URL"] = f"{api_tunnel_url}/storage"

        log.info("===== Run remote worker ====")
        log.info(url)
        # log.info(json.dumps(req.model_dump(), indent=2))
        result = {}

        async with client.stream(
            "POST",
            url,
            headers=headers,
            json=req.model_dump(),
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                try:
                    message = json.loads(line)
                    print(message)

                    if isinstance(message, dict) and "type" in message:
                        if message["type"] == "node_progress":
                            self.post_message(NodeProgress(**message))

                        elif message["type"] == "node_update":
                            self.post_message(NodeUpdate(**message))

                        elif message["type"] == "workflow_update":
                            self.post_message(WorkflowUpdate(**message))

                        elif message["type"] == "error":
                            raise Exception(message["error"])

                except json.JSONDecodeError as e:
                    log.error("Error decoding message: " + str(e))

        return result
