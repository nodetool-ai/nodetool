# nodetool.nodes.fal.fal_node

## FALNode

FAL Node for interacting with FAL AI services.

**Tags:** Provides methods to submit and handle API requests to FAL endpoints.

**Fields:**

### get_client

**Args:**
- **context (ProcessingContext)**

**Returns:** AsyncClient

### submit_request

Submit a request to a FAL AI endpoint and return the result.


**Args:**

- **application (str)**: The path to the FAL model (e.g., "fal-ai/flux/dev/image-to-image")
- **arguments (Dict[str, Any])**: The arguments to pass to the model
- **with_logs (bool, optional)**: Whether to include logs in the response. Defaults to True.


**Returns:**

- **Dict[str, Any]**: The result from the FAL API
**Args:**
- **context (ProcessingContext)**
- **application (str)**
- **arguments (typing.Dict[str, typing.Any])**

**Returns:** typing.Dict[str, typing.Any]


