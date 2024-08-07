# nodetool.storage.abstract_node_cache

## AbstractNodeCache

An abstract base class defining the interface for node caching implementations.

### clear

Clear the entire cache.
**Args:**

### get

Retrieve a value from the cache.


**Args:**

- **key (str)**: The key to retrieve.


**Returns:**

- **Any**: The value associated with the key, or None if not found.
### set

Set a value in the cache with an optional TTL.


**Args:**

- **key (str)**: The key to set.
- **value (Any)**: The value to store.
- **ttl (int, optional)**: Time-to-live in seconds. If None, the entry won't expire.
