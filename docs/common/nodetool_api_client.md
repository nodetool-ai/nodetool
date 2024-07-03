# nodetool.common.nodetool_api_client

## NodetoolAPIClient

#### `check_status`

**Parameters:**

- `response` (Response)

#### `delete`

**Parameters:**

- `path` (str)

**Returns:** `Response`

#### `get`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `get_base_url`

**Parameters:**


#### `head`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `post`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `put`

**Parameters:**

- `path` (str)
- `kwargs`

**Returns:** `Response`

#### `stream`

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

#### `from_httpx`

**Parameters:**

- `response` (Response)

#### `json`

**Parameters:**


