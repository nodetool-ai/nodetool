# nodetool.common.nodetool_api_client

## NodetoolAPIClient

### check_status

**Args:**
- **response (Response)**

### delete

**Args:**
- **path (str)**

**Returns:** Response

### get

**Args:**
- **path (str)**
- **kwargs**

**Returns:** Response

### get_base_url

**Args:**

### head

**Args:**
- **path (str)**
- **kwargs**

**Returns:** Response

### post

**Args:**
- **path (str)**
- **kwargs**

**Returns:** Response

### put

**Args:**
- **path (str)**
- **kwargs**

**Returns:** Response

### stream

**Args:**
- **method (str)**
- **path (str)**
- **json (dict[str, typing.Any] | None) (default: None)**
- **kwargs**

**Returns:** typing.AsyncGenerator[str, NoneType]

## Response

Represents an HTTP response.
Attributes:
content (bytes): The content of the response.
status_code (int): The status code of the response.
headers (Dict[str, str]): The headers of the response.
media_type (str): The media type of the response.

**Tags:** 

### from_httpx

**Args:**
- **response (Response)**

### json

**Args:**

