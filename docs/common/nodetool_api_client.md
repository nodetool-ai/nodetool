# nodetool.common.nodetool_api_client

## NodetoolAPIClient

#### `check_status(self, response: httpx.Response)`

**Parameters:**

- `response` (Response)

#### `delete(self, path: str) -> nodetool.common.nodetool_api_client.Response`

**Parameters:**

- `path` (str)

**Returns:** `Response`

#### `get(self, path: str, **kwargs) -> nodetool.common.nodetool_api_client.Response`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `get_base_url(self)`

**Parameters:**


#### `head(self, path: str, **kwargs) -> nodetool.common.nodetool_api_client.Response`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `post(self, path: str, **kwargs) -> nodetool.common.nodetool_api_client.Response`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `put(self, path: str, **kwargs) -> nodetool.common.nodetool_api_client.Response`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `stream(self, method: str, path: str, json: dict[str, typing.Any] | None = None, **kwargs) -> AsyncGenerator[str, NoneType]`

**Parameters:**

- `method` (str)
- `path` (str)
- `json` (dict[str, typing.Any] | None) (default: `None`)
- `kwargs`

**Returns:** `typing.AsyncGenerator[str, NoneType]`

## Response

Represents an HTTP response.
Attributes:
content (bytes): The content of the response.
status_code (int): The status code of the response.
headers (Dict[str, str]): The headers of the response.
media_type (str): The media type of the response.

**Tags:** 

#### `from_httpx(response: httpx.Response)`

**Parameters:**

- `response` (Response)

#### `json(self)`

**Parameters:**


