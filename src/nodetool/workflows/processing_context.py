import asyncio
from datetime import datetime
from enum import Enum
import json
from queue import Queue
import urllib.parse
import uuid
import httpx
import joblib
import base64
import PIL.Image
import numpy as np
import pandas as pd

from nodetool.api.types.asset import Asset, AssetCreateRequest, AssetList
from nodetool.api.types.chat import (
    MessageList,
    MessageCreateRequest,
    TaskCreateRequest,
    TaskList,
)
from nodetool.api.types.prediction import (
    Prediction,
    PredictionCreateRequest,
    PredictionResult,
)
from nodetool.api.types.workflow import Workflow
from nodetool.common.async_iterators import AsyncByteStream
from nodetool.common.nodetool_api_client import NodetoolAPIClient, Response
from nodetool.metadata.types import Message, Task
from nodetool.workflows.graph import Graph
from nodetool.workflows.types import (
    NodeProgress,
    NodeUpdate,
    ProcessingMessage,
    WorkflowUpdate,
)
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.metadata.types import (
    AssetRef,
    AudioRef,
    ColumnDef,
    DataframeRef,
    FunctionModel,
    ImageRef,
    ModelRef,
    TextRef,
    VideoRef,
    dtype_name,
)
from nodetool.common.environment import Environment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.property import Property
from nodetool.metadata.types import ImageRef
from nodetool.common.environment import Environment


from io import BytesIO
from typing import IO, Any, Literal
from pickle import dumps, loads


log = Environment.get_logger()


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
    - Interacts with the Nodetool API client for asset-related operations.
    - Retrieves and manages asset storage and temporary storage instances.
    - Handles file uploads and downloads to/from storage services.

    Workflow Execution:
    - Runs the workflow by sending a RunJobRequest to a remote worker.
    - Processes and handles various types of messages received from the worker (node progress, updates, errors).

    Utility Methods:
    - Provides helper methods for converting values for prediction, handling enums, and parsing S3 URLs.
    - Supports data conversion between different formats (e.g., TextRef to string, DataFrame to pandas DataFrame).

    Attributes:
        user_id (str): The ID of the user running the workflow.
        auth_token (str): The authentication token for the user.
        workflow_id (str): The ID of the workflow being executed.
        capabilities (list[str]): The capabilities required by the workflow.
        graph (Graph): The graph representing the workflow.
        cost (float): The cost of running the workflow.
        results (dict[str, Any]): The results of the processed nodes.
        processed_nodes (set[str]): The IDs of the nodes that have been processed.
        message_queue (Queue | asyncio.Queue): The queue for processing messages.
        api_client (NodetoolAPIClient): The API client for interacting with the Nodetool API.
    """

    user_id: str
    auth_token: str
    workflow_id: str
    capabilities: list[str]
    graph: Graph
    cost: float = 0.0
    results: dict[str, Any]
    processed_nodes: set[str]
    message_queue: Queue | asyncio.Queue
    api_client: NodetoolAPIClient

    def __init__(
        self,
        user_id: str,
        auth_token: str,
        workflow_id: str = "",
        graph: Graph = Graph(),
        queue: Queue | asyncio.Queue | None = None,
        capabilities: list[str] | None = None,
        http_client: httpx.AsyncClient | None = None,
    ):
        self.user_id = user_id
        self.auth_token = auth_token
        self.workflow_id = workflow_id
        self.graph = graph
        self.results = {}
        self.processed_nodes = set()
        self.message_queue = queue if queue else asyncio.Queue()
        self.capabilities = (
            capabilities if capabilities else Environment.get_capabilities()
        )
        self.api_client = Environment.get_nodetool_api_client(
            self.user_id, self.auth_token
        )
        self.http_client = (
            httpx.AsyncClient(follow_redirects=True, timeout=600)
            if http_client is None
            else http_client
        )
        assert self.auth_token is not None, "Auth token is required"

    async def pop_message_async(self) -> ProcessingMessage:
        """
        Retrieves and removes a message from the message queue.
        The message queue is used to communicate updates to upstream
        processing.

        Returns:
            The retrieved message from the message queue.
        """
        assert isinstance(self.message_queue, asyncio.Queue)
        return await self.message_queue.get()

    def pop_message(self) -> ProcessingMessage:
        """
        Removes and returns the next message from the message queue.

        Returns:
            The next message from the message queue.
        """
        assert isinstance(self.message_queue, Queue)
        return self.message_queue.get()

    def post_message(self, message: ProcessingMessage):
        """
        Posts a message to the message queue.

        Args:
            message (ProcessingMessage): The message to be posted.
        """
        self.message_queue.put_nowait(message)

    def has_messages(self) -> bool:
        """
        Checks if the processing context has any messages in the message queue.

        Returns:
            bool: True if the message queue is not empty, False otherwise.
        """
        return not self.message_queue.empty()

    def asset_storage_url(self, key: str) -> str:
        """
        Returns the URL of an asset in the asset storage.

        Args:
            key (str): The key of the asset.
        """
        return Environment.get_asset_storage().get_url(key)

    def temp_storage_url(self, key: str) -> str:
        """
        Returns the URL of an asset in the temp storage.

        Args:
            key (str): The key of the asset.
        """
        return Environment.get_temp_storage().get_url(key)

    async def find_asset(self, asset_id: str):
        """
        Finds an asset by id.

        Args:
            asset_id (str): The ID of the asset.

        Returns:
            Asset: The asset with the given ID.
        """
        res = await self.api_client.get(f"api/assets/{asset_id}")
        return Asset(**res.json())

    async def get_asset_url(self, asset_id: str):
        """
        Returns the asset url.

        Args:
            asset_id (str): The ID of the asset.

        Returns:
            str: The URL of the asset.
        """
        asset = await self.find_asset(asset_id)  # type: ignore

        return self.asset_storage_url(asset.file_name)

    def get_result(self, node_id: str, slot: str) -> Any:
        """
        Get the result of a node.

        Results are stored in the context's results dictionary after a node is processed.

        Args:
            node_id (str): The ID of the node.
            slot (str): The slot name.

        Returns:
            Any: The result of the node.
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

        Args:
            node_id (str): The ID of the node.
            res (dict[str, Any]): The result of the node.
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
            for edge in self.graph.edges
            if edge.target == node_id
        }

    def find_node(self, node_id: str) -> BaseNode:
        """
        Finds a node by its ID.

        Args:
            node_id (str): The ID of the node to be found.

        Returns:
            BaseNode: The node with the given ID.

        Raises:
            ValueError: If the node with the given ID does not exist.
        """
        node = self.graph.find_node(node_id)
        if node is None:
            raise ValueError(f"Node with ID {node_id} does not exist")
        return node

    async def get_workflow(self, workflow_id: str):
        """
        Gets the workflow by ID.
        """
        res = await self.api_client.get(f"api/workflows/{workflow_id}")
        return Workflow(**res.json())

    async def run_prediction(
        self,
        node_id: str,
        provider: Literal["huggingface", "replicate", "openai", "anthropic"],
        model: str,
        params: dict[str, Any] | None = None,
        data: bytes | None = None,
    ) -> Any:
        """
        Run a prediction on a third-party provider.

        Args:
            node_id (str): The ID of the node.
            provider (Literal["huggingface", "replicate", "openai", "anthropic"]): The provider to use for the prediction.
            model (str): The name of the model to use for the prediction.
            params (dict[str, Any] | None, optional): Additional parameters for the prediction. Defaults to None.
            data (bytes | None, optional): Input data for the prediction. Defaults to None.

        Returns:
            Any: The result of the prediction.

        """

        data_encoded = (
            base64.b64encode(data).decode("utf-8") if isinstance(data, bytes) else None
        )

        req = PredictionCreateRequest(
            provider=provider,
            model=model,
            node_id=node_id,
            workflow_id=self.workflow_id if self.workflow_id else "",
            params=params or {},
            data=data_encoded,
        )

        async for line in self.api_client.stream(
            "POST",
            "api/predictions/",
            json=req.model_dump(),
        ):
            msg = json.loads(line)
            if msg.get("type") == "prediction_result":
                return PredictionResult(**msg).decode_content()
            elif msg.get("type") == "prediction":
                self.post_message(Prediction(**msg))

        raise ValueError("Prediction did not return a result")

    async def paginate_assets(
        self,
        parent_id: str | None = None,
        page_size: int = 100,
        cursor: str | None = None,
    ) -> AssetList:
        """
        Lists children assets for a given parent asset.
        Lists top level assets if parent_id is None.

        Args:
            parent_id (str | None, optional): The ID of the parent asset. Defaults to None.
            page_size (int, optional): The number of assets to return. Defaults to 100.
            cursor (str | None, optional): The cursor for pagination. Defaults to None.

        Returns:
            AssetList: The list of assets.
        """
        res = await self.api_client.get(
            "api/assets/",
            params={"parent_id": parent_id, page_size: page_size, "cursor": cursor},
        )
        return AssetList(**res.json())

    async def refresh_uri(self, asset: AssetRef):
        """
        Refreshes the URI of the asset.

        Args:
            asset (AssetRef): The asset to refresh.
        """
        if asset.asset_id:
            asset.uri = await self.get_asset_url(asset.asset_id)
        elif asset.temp_id:
            asset.uri = self.temp_storage_url(asset.temp_id)

    async def create_asset(
        self,
        name: str,
        content_type: str,
        content: IO,
        parent_id: str | None = None,
    ) -> Asset:
        """
        Creates an asset with the given name, content type, content, and optional parent ID.

        Args:
            name (str): The name of the asset.
            content_type (str): The content type of the asset.
            content (IO): The content of the asset.
            parent_id (str | None, optional): The ID of the parent asset. Defaults to None.

        Returns:
            Asset: The created asset.

        """
        content.seek(0)

        req = AssetCreateRequest(
            workflow_id=self.workflow_id,
            name=name,
            content_type=content_type,
            parent_id=parent_id,
        )
        res = await self.api_client.post(
            "api/assets/",
            data={"json": req.model_dump_json()},
            files={"file": (name, content, content_type)},
        )

        return Asset(**res.json())

    async def create_temp_asset(self, content: IO, ext: str = "") -> AssetRef:
        """
        Uploads a temporary asset with the given content and extension.

        Args:
            content (IO): The content of the asset.
            ext (str, optional): The extension of the asset. Defaults to "".

        Returns:
            str: The URL of the created temporary asset.
        """
        key = uuid.uuid4().hex
        if ext != "":
            key += "." + ext
        url = self.temp_storage_url(key)
        # parse uri
        path = urllib.parse.urlparse(url).path
        stream = AsyncByteStream(content.read())
        await self.api_client.put(path, content=stream)
        return AssetRef(uri=url, temp_id=key)

    async def create_message(self, req: MessageCreateRequest):
        """
        Creates a message for a thread.

        Args:
            req (MessageCreateRequest): The message to create.

        Returns:
            Message: The created message.
        """
        res = await self.api_client.post("api/messages/", json=req.model_dump())
        return Message(**res.json())

    async def get_messages(
        self,
        thread_id: str,
        limit: int = 10,
        start_key: str | None = None,
        reverse: bool = False,
    ):
        """
        Gets messages for a thread.

        Args:
            thread_id (str): The ID of the thread.
            limit (int, optional): The number of messages to return. Defaults to 10.
            start_key (str, optional): The start key for pagination. Defaults to None.
            reverse (bool, optional): Whether to reverse the order of messages. Defaults to False.

        Returns:
            MessageList: The list of messages.
        """
        res = await self.api_client.get(
            "api/messages/",
            params={"thread_id": thread_id, "limit": limit, "cursor": start_key},
        )
        return MessageList(**res.json())

    async def create_task(self, task: TaskCreateRequest):
        """
        Creates a task.

        Args:
            task (TaskCreateRequest): The task to create.

        Returns:
            Task: The created task.
        """
        res = await self.api_client.post("api/tasks/", json=task.model_dump())
        return Task(**res.json())

    async def get_tasks(self, thread_id: str):
        """
        Gets tasks for a thread.

        Args:
            thread_id (str): The ID of the thread.

        Returns:
            TaskList: The list of tasks.
        """
        res = await self.api_client.get("api/tasks/", params={"thread_id": thread_id})
        return TaskList(**res.json())

    async def download_asset(self, asset_id: str) -> IO:
        """
        Downloads an asset from the asset storage api.

        Args:
            asset_id (str): The ID of the asset to download.

        Returns:
            IO: The downloaded asset.
        """
        asset = await self.find_asset(asset_id)
        io = BytesIO()
        await Environment.get_asset_storage().download(asset.file_name, io)
        io.seek(0)
        return io

    async def download_temp_asset(self, temp_id: str) -> IO:
        """
        Downloads a temporary asset from the temp storage.

        Args:
            temp_id (str): The ID of the temporary asset to download.

        Returns:
            IO: The downloaded temporary asset.
        """
        io = BytesIO()
        await Environment.get_temp_storage().download(temp_id, io)
        io.seek(0)
        return io

    async def http_get(self, url: str) -> bytes:
        """
        Sends an HTTP GET request to the specified URL.

        Args:
            url (str): The URL to send the request to.

        Returns:
            bytes: The response content.
        """
        response = await self.http_client.get(url)
        response.raise_for_status()
        return response.content

    async def download_file(self, url: str) -> IO:
        """
        Download a file from URL.

        Args:
            url (str): The URL of the file to download.

        Returns:
            IO: The downloaded file.
        """
        from nodetool.common.encoding import decode_bytes_io

        url_parsed = urllib.parse.urlparse(url)

        if url_parsed.scheme == "data":
            file = decode_bytes_io(url.split(",")[1])
            # parse file ext from data uri
            ext = url.split(",")[0].split(";")[0].split("/")[1]
            file.name = f"{uuid.uuid4()}.{ext}"
            return file

        return BytesIO(await self.http_get(url))

    async def asset_to_io(self, asset_ref: AssetRef) -> IO:
        """
        Converts an AssetRef object to an IO object.

        Args:
            asset_ref (AssetRef): The AssetRef object to convert.

        Returns:
            IO: The converted IO object.

        Raises:
            ValueError: If the AssetRef is empty.
        """
        # Asset ID takes precedence over URI
        # as the URI could be expired
        if asset_ref.asset_id is not None:
            return await self.download_asset(asset_ref.asset_id)
        elif asset_ref.temp_id is not None:
            return await self.download_temp_asset(asset_ref.temp_id)
        elif asset_ref.uri != "":
            return await self.download_file(asset_ref.uri)
        raise ValueError(f"AssetRef is empty {asset_ref}")

    async def image_to_pil(self, image_ref: ImageRef) -> PIL.Image.Image:
        """
        Converts the image to a PIL Image object.

        Args:
            context (ProcessingContext): The processing context.
        """
        buffer = await self.asset_to_io(image_ref)
        return PIL.Image.open(buffer).convert("RGB")

    async def image_to_base64(self, image_ref: ImageRef) -> str:
        """
        Converts the image to a base64-encoded string.

        Args:
            context (ProcessingContext): The processing context.
        """
        buffer = await self.asset_to_io(image_ref)
        return base64.b64encode(buffer.read()).decode("utf-8")

    async def audio_to_audio_segment(self, audio_ref: AudioRef):
        """
        Converts the audio to an AudioSegment object.

        Args:
            context (ProcessingContext): The processing context.
        """
        import pydub

        audio_bytes = await self.asset_to_io(audio_ref)
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
            asset = await self.create_asset(
                name=name, content_type="audio/mp3", content=buffer, parent_id=parent_id
            )
            return AudioRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer, "mp3")
            return AudioRef(temp_id=ref.temp_id, uri=ref.uri)

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
        audio_segment = await self.audio_to_audio_segment(audio_ref)
        return np.array(audio_segment.get_array_of_samples()), audio_segment.frame_rate

    async def audio_from_segment(
        self,
        audio_segment: "pydub.AudioSegment",  # type: ignore
        name: str | None = None,
        parent_id: str | None = None,
        **kwargs,
    ) -> "AudioRef":
        """
        Converts an audio segment to an AudioRef object.

        Args:
            audio_segment (pydub.AudioSegment): The audio segment to convert.
            name (str, optional): The name of the audio. Defaults to None.
            parent_id (str, optional): The ID of the parent asset. Defaults to None.
            **kwargs: Additional keyword arguments.

        Returns:
            AudioRef: The converted AudioRef object.

        """
        buffer = BytesIO()
        audio_segment.export(buffer, format="mp3")
        buffer.seek(0)
        if name:
            asset = await self.create_asset(
                name, "audio/mp3", buffer, parent_id=parent_id
            )
            return AudioRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer, "mp3")
            return AudioRef(
                temp_id=ref.temp_id,
                uri=ref.uri,
            )

    async def dataframe_to_pandas(self, df: DataframeRef) -> "pd.DataFrame":
        """
        Converts a DataframeRef object to a pandas DataFrame.

        Args:
            df (DataframeRef): The DataframeRef object to convert.

        Returns:
            pandas.DataFrame: The converted pandas DataFrame.
        """
        import pandas as pd

        if df.columns:
            column_names = [col.name for col in df.columns]
            return pd.DataFrame(df.data, columns=column_names)
        else:
            io = await self.asset_to_io(df)
            df = loads(io.read())
            assert isinstance(df, pd.DataFrame), "Is not a dataframe"
            return df

    async def dataframe_from_pandas(
        self, data: "pd.DataFrame", name: str | None = None
    ) -> "DataframeRef":
        """
        Converts a pandas DataFrame to a DataframeRef object.

        Args:
            data (pd.DataFrame): The pandas DataFrame to convert.
            name (str | None, optional): The name of the asset. Defaults to None.

        Returns:
            DataframeRef: The converted DataframeRef object.
        """
        buffer = BytesIO(dumps(data))
        if name:
            asset = await self.create_asset(name, "application/octet-stream", buffer)
            return DataframeRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer)
            # TODO: avoid for large tables
            rows = data.values.tolist()
            column_defs = [
                ColumnDef(name=name, data_type=dtype_name(dtype.name))
                for name, dtype in zip(data.columns, data.dtypes)
            ]
            return DataframeRef(temp_id=ref.temp_id, columns=column_defs, data=rows)

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
            asset = await self.create_asset(
                name=name, content_type="image/png", content=buffer, parent_id=parent_id
            )
            return ImageRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer)
            return ImageRef(temp_id=ref.temp_id, uri=ref.uri)

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
            await self.download_file(url), name=name, parent_id=parent_id
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
            stream = await self.asset_to_io(text_ref)
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
            asset = await self.create_asset(
                name, content_type, buffer, parent_id=parent_id
            )
            return TextRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer)
            return TextRef(temp_id=ref.temp_id, uri=ref.uri)

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
            asset = await self.create_asset(
                name, "video/mpeg", buffer, parent_id=parent_id
            )
            return VideoRef(asset_id=asset.id, uri=asset.get_url or "")
        else:
            ref = await self.create_temp_asset(buffer)
            return VideoRef(temp_id=ref.temp_id, uri=ref.uri)

    async def to_estimator(self, model_ref: ModelRef):
        """
        Converts a model reference to an estimator object.

        Args:
            model_ref (ModelRef): The model reference to convert.

        Returns:
            The loaded estimator object.

        Raises:
            ValueError: If the model reference is empty.
        """
        if model_ref.asset_id is None:
            raise ValueError("ModelRef is empty")
        file = await self.asset_to_io(model_ref)
        return joblib.load(file)

    async def from_estimator(self, est: "BaseEstimator", **kwargs):  # type: ignore
        """
        Create a model asset from an estimator.

        Args:
            est (BaseEstimator): The estimator object to be serialized.
            **kwargs: Additional keyword arguments.

        Returns:
            ModelRef: A reference to the created model asset.

        """
        stream = BytesIO()
        joblib.dump(est, stream)
        stream.seek(0)
        asset = await self.create_asset("model", "application/model", stream)

        return ModelRef(uri=asset.get_url or "", asset_id=asset.id, **kwargs)

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
            io = await self.asset_to_io(value)
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
                raise ValueError(f"Invalid enum value {value} : {type(value)}")
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

        if req.env is None:
            req.env = {}

        if Environment.get_use_ngrok():
            api_tunnel_url = Environment.get_api_tunnel_url()
            req.env["NODETOOL_API_URL"] = api_tunnel_url
            req.env["S3_ENDPOINT_URL"] = f"{api_tunnel_url}/storage"

        log.info("===== Run remote worker ====")
        log.info(url)
        # log.info(json.dumps(req.model_dump(), indent=2))
        result = {}

        async with self.http_client.stream(
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

    def get_chroma_client(self):
        import chromadb
        from chromadb.config import DEFAULT_DATABASE, DEFAULT_TENANT

        settings = Environment.get_chroma_settings()

        if Environment.get_chroma_url():
            admin = chromadb.AdminClient()
            tenant = f"tenant_{self.user_id}"
            try:
                admin.get_tenant(tenant)
            except Exception:
                admin.create_tenant(tenant)
                admin.create_database(DEFAULT_DATABASE, tenant)
            return chromadb.HttpClient(
                host=Environment.get_chroma_url(), settings=settings
            )
        else:
            return chromadb.PersistentClient(
                path=Environment.get_chroma_path(),
                tenant=DEFAULT_TENANT,
                database=DEFAULT_DATABASE,
            )

    def load_llama_model(self, name, **kwargs):
        from llama_cpp import Llama
        from llama_cpp.llama_tokenizer import LlamaHFTokenizer

        model = Environment.find_llama_model(name)
        assert model, "model not found"

        if model.local_path is None:
            raise Exception("model path is None")

        if not model.local_path.exists():
            raise Exception(f"path doesn not exist {model.local_path}")

        return Llama(
            verbose=True,
            model_path=str(model.local_path),
            chat_format="functionary-v2" if isinstance(model, FunctionModel) else None,
            # tokenizer=LlamaHFTokenizer.from_pretrained(found_model.repo_id),
            **kwargs,
        )
