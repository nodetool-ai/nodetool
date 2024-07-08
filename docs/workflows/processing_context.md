# nodetool.workflows.processing_context

## ProcessingContext

The processing context is the workflow's interface to the outside world.

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

**Tags:** It maintains the state of the workflow and provides methods for interacting with the environment.

### asset_storage_url

Returns the URL of an asset in the asset storage.


**Args:**

- **key (str)**: The key of the asset.
**Returns:** str

### asset_to_io

Converts an AssetRef object to an IO object.


**Args:**

- **asset_ref (AssetRef)**: The AssetRef object to convert.


**Returns:**

- **IO**: The converted IO object.


**Raises:**

- **ValueError**: If the AssetRef is empty.
### audio_from_bytes

Creates an AudioRef from a bytes object.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **b (bytes)**: The bytes object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.


**Returns:**

- **AudioRef**: The AudioRef object.
### audio_from_io

Creates an AudioRef from an IO object.


**Args:**

- **buffer (IO)**: The IO object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None
- **parent_id (Optional[str], optional)**: The parent ID of the asset. Defaults to None.


**Returns:**

- **AudioRef**: The AudioRef object.
### audio_from_numpy

**Args:**
- **data (ndarray)**
- **sample_rate (int)**
- **name (str | None) (default: None)**
- **parent_id (str | None) (default: None)**

**Returns:** AudioRef

### audio_from_segment

Converts an audio segment to an AudioRef object.


**Args:**

- **audio_segment (pydub.AudioSegment)**: The audio segment to convert.
- **name (str, optional)**: The name of the audio. Defaults to None.
- **parent_id (str, optional)**: The ID of the parent asset. Defaults to None.
- ****kwargs**: Additional keyword arguments.


**Returns:**

- **AudioRef**: The converted AudioRef object.
### audio_to_audio_segment

Converts the audio to an AudioSegment object.


**Args:**

- **context (ProcessingContext)**: The processing context.
**Returns:** AudioSegment

### audio_to_numpy

**Args:**
- **audio_ref (AudioRef)**

**Returns:** tuple[numpy.ndarray, int]

### cache_result

Cache the result for a node.
**Args:**
- **node (BaseNode)**
- **result (Any)**
- **ttl (int) (default: 3600)**

### convert_value_for_prediction

Converts the property value for a remote api prediction on replicate or huggingface.


**Args:**

- **property (Property)**: The property.
- **value**: The value to be converted.


**Raises:**

- **NotImplementedError**: If the self type is 'tensor' and not implemented.
- **ValueError**: If the self value is an invalid enum value.
### create_asset

Creates an asset with the given name, content type, content, and optional parent ID.


**Args:**

- **name (str)**: The name of the asset.
- **content_type (str)**: The content type of the asset.
- **content (IO)**: The content of the asset.
- **parent_id (str | None, optional)**: The ID of the parent asset. Defaults to None.


**Returns:**

- **Asset**: The created asset.
### create_message

Creates a message for a thread.


**Args:**

- **req (MessageCreateRequest)**: The message to create.


**Returns:**

- **Message**: The created message.
### create_task

Creates a task.


**Args:**

- **task (TaskCreateRequest)**: The task to create.


**Returns:**

- **Task**: The created task.
### create_temp_asset

Uploads a temporary asset with the given content and extension.


**Args:**

- **content (IO)**: The content of the asset.
- **ext (str, optional)**: The extension of the asset. Defaults to "".


**Returns:**

- **str**: The URL of the created temporary asset.
### dataframe_from_pandas

Converts a pandas DataFrame to a DataframeRef object.


**Args:**

- **data (pd.DataFrame)**: The pandas DataFrame to convert.
- **name (str | None, optional)**: The name of the asset. Defaults to None.


**Returns:**

- **DataframeRef**: The converted DataframeRef object.
### dataframe_to_pandas

Converts a DataframeRef object to a pandas DataFrame.


**Args:**

- **df (DataframeRef)**: The DataframeRef object to convert.


**Returns:**

- **pandas.DataFrame**: The converted pandas DataFrame.
### download_asset

Downloads an asset from the asset storage api.


**Args:**

- **asset_id (str)**: The ID of the asset to download.


**Returns:**

- **IO**: The downloaded asset.
### download_file

Download a file from URL.


**Args:**

- **url (str)**: The URL of the file to download.


**Returns:**

- **IO**: The downloaded file.
### download_temp_asset

Downloads a temporary asset from the temp storage.


**Args:**

- **temp_id (str)**: The ID of the temporary asset to download.


**Returns:**

- **IO**: The downloaded temporary asset.
### find_asset

Finds an asset by id.


**Args:**

- **asset_id (str)**: The ID of the asset.


**Returns:**

- **Asset**: The asset with the given ID.
### find_node

Finds a node by its ID.


**Args:**

- **node_id (str)**: The ID of the node to be found.


**Returns:**

- **BaseNode**: The node with the given ID.


**Raises:**

- **ValueError**: If the node with the given ID does not exist.
### from_estimator

Create a model asset from an estimator.


**Args:**

- **est (BaseEstimator)**: The estimator object to be serialized.
- ****kwargs**: Additional keyword arguments.


**Returns:**

- **ModelRef**: A reference to the created model asset.
### generate_node_cache_key

Generate a cache key for a node based on current user, node type and properties.
**Args:**
- **node (BaseNode)**

**Returns:** str

### get

Gets the value of a variable from the context.


**Args:**

- **key (str)**: The key of the variable.
- **default (Any, optional)**: The default value to return if the key is not found. Defaults to None.


**Returns:**

- **Any**: The value of the variable.
### get_asset_url

Returns the asset url.


**Args:**

- **asset_id (str)**: The ID of the asset.


**Returns:**

- **str**: The URL of the asset.
### get_cached_result

Get the cached result for a node.
**Args:**
- **node (BaseNode)**

**Returns:** Any

### get_chroma_client

**Args:**

### get_messages

Gets messages for a thread.


**Args:**

- **thread_id (str)**: The ID of the thread.
- **limit (int, optional)**: The number of messages to return. Defaults to 10.
- **start_key (str, optional)**: The start key for pagination. Defaults to None.
- **reverse (bool, optional)**: Whether to reverse the order of messages. Defaults to False.


**Returns:**

- **MessageList**: The list of messages.
### get_node_inputs

Retrieves the inputs for a given node.


**Args:**

- **node_id (str)**: The ID of the node.


**Returns:**

- **dict[str, Any]**: A dictionary containing the inputs for the node, where the keys are the input slot names
and the values are the results from the corresponding source nodes.
### get_result

Get the result of a node.

Results are stored in the context's results dictionary after a node is processed.


**Args:**

- **node_id (str)**: The ID of the node.
- **slot (str)**: The slot name.


**Returns:**

- **Any**: The result of the node.
### get_tasks

Gets tasks for a thread.


**Args:**

- **thread_id (str)**: The ID of the thread.


**Returns:**

- **TaskList**: The list of tasks.
### get_workflow

Gets the workflow by ID.
**Args:**
- **workflow_id (str)**

### has_messages

Checks if the processing context has any messages in the message queue.


**Returns:**

- **bool**: True if the message queue is not empty, False otherwise.
**Args:**

### http_get

Sends an HTTP GET request to the specified URL.


**Args:**

- **url (str)**: The URL to send the request to.


**Returns:**

- **bytes**: The response content.
### image_from_base64

Creates an ImageRef from a base64-encoded string.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **b64 (str)**: The base64-encoded string.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_bytes

Creates an ImageRef from a bytes object.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **b (bytes)**: The bytes object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_io

Creates an ImageRef from an IO object.


**Args:**

- **buffer (IO)**: The IO object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None
- **parent_id (Optional[str], optional)**: The parent ID of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_numpy

Creates an ImageRef from a numpy array.


**Args:**

- **image (np.ndarray)**: The numpy array.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.
- **parent_id (Optional[str], optional)**: The parent ID of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_openai

Creates an ImageRef from an OpenAI ImageFile object.


**Args:**

- **file_id (str)**: The ID of the file.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_pil

Creates an ImageRef from a PIL Image object.


**Args:**

- **image (Image.Image)**: The PIL Image object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.
- **parent_id (Optional[str], optional)**: The parent ID of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_from_url

Creates an ImageRef from a URL.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **url (str)**: The URL.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.


**Returns:**

- **ImageRef**: The ImageRef object.
### image_to_base64

Converts the image to a PNG base64-encoded string.


**Args:**

- **context (ProcessingContext)**: The processing context.
**Returns:** str

### image_to_pil

Converts the image to a PIL Image object.


**Args:**

- **context (ProcessingContext)**: The processing context.
**Returns:** Image

### paginate_assets

Lists children assets for a given parent asset.
Lists top level assets if parent_id is None.


**Args:**

- **parent_id (str | None, optional)**: The ID of the parent asset. Defaults to None.
- **page_size (int, optional)**: The number of assets to return. Defaults to 100.
- **cursor (str | None, optional)**: The cursor for pagination. Defaults to None.


**Returns:**

- **AssetList**: The list of assets.
### pop_message

Removes and returns the next message from the message queue.


**Returns:**

The next message from the message queue.
**Args:**

### pop_message_async

Retrieves and removes a message from the message queue.
The message queue is used to communicate updates to upstream
processing.


**Returns:**

The retrieved message from the message queue.
**Args:**

### post_message

Posts a message to the message queue.


**Args:**

- **message (ProcessingMessage)**: The message to be posted.
### refresh_uri

Refreshes the URI of the asset.


**Args:**

- **asset (AssetRef)**: The asset to refresh.
### run_prediction

Run a prediction on a third-party provider.


**Args:**

- **node_id (str)**: The ID of the node.
- **provider (Literal["huggingface", "replicate", "openai", "anthropic"])**: The provider to use for the prediction.
- **model (str)**: The name of the model to use for the prediction.
- **params (dict[str, Any] | None, optional)**: Additional parameters for the prediction. Defaults to None.
- **data (bytes | None, optional)**: Input data for the prediction. Defaults to None.


**Returns:**

- **Any**: The result of the prediction.
### run_worker

Runs the workflow using the provided graph and parameters.


**Args:**

- **graph (Graph)**: The graph representing the workflow.
- **params (dict, optional)**: Additional parameters for the workflow. Defaults to {}.


**Returns:**

- **dict[str, Any]**: The result of running the workflow.
### set_result

Set the result of a node.

Results are stored in the context's results dictionary after a node is processed.


**Args:**

- **node_id (str)**: The ID of the node.
- **res (dict[str, Any])**: The result of the node.
### temp_storage_url

Returns the URL of an asset in the temp storage.


**Args:**

- **key (str)**: The key of the asset.
**Returns:** str

### text_from_str

**Args:**
- **s (str)**
- **name (str | None) (default: None)**
- **content_type (str) (default: text/plain)**
- **parent_id (str | None) (default: None)**

**Returns:** TextRef

### to_estimator

Converts a model reference to an estimator object.


**Args:**

- **model_ref (ModelRef)**: The model reference to convert.


**Returns:**

The loaded estimator object.


**Raises:**

- **ValueError**: If the model reference is empty.
### to_str

Converts a TextRef to a string.


**Args:**

- **text_ref (TextRef)**: The TextRef object.


**Returns:**

- **str**: The string.
### update_task

Updates a task.


**Args:**

- **task_id (str)**: The ID of the task to update.
- **task (TaskUpdateRequest)**: The task update request.


**Returns:**

- **Task**: The updated task.
### video_from_io

Creates an VideoRef from an IO object.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **buffer (IO)**: The IO object.
- **name (Optional[str], optional)**: The name of the asset. Defaults to None.


**Returns:**

- **VideoRef**: The VideoRef object.
