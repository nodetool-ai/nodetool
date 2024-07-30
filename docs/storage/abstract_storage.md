# nodetool.storage.abstract_storage

## AbstractStorage

### delete

**Args:**
- **file_name (str)**

### download

**Args:**
- **key (str)**
- **stream (IO)**

### download_stream

**Args:**
- **key (str)**

**Returns:** typing.AsyncIterator[bytes]

### file_exists

**Args:**
- **key (str)**

**Returns:** bool

### get_base_url

**Args:**

**Returns:** str

### get_mtime

**Args:**
- **key (str)**

**Returns:** datetime

### get_url

**Args:**
- **key (str)**

**Returns:** str

### upload

**Args:**
- **key (str)**
- **content (IO)**

**Returns:** str

