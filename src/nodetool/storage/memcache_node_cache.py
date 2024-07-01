from typing import Any
from pymemcache import Client
from pymemcache.exceptions import MemcacheUnknownError
import json
from .abstract_node_cache import AbstractNodeCache


class MemcachedNodeCache(AbstractNodeCache):
    """
    A class to manage caching of node results across multiple WorkflowRunner instances,
    using Memcached as the backend.
    """

    def __init__(self, host="localhost", port=11211):
        self.client = Client((host, port))

    def get(self, key: str) -> Any:
        try:
            value = self.client.get(key)
            return json.loads(value) if value else None
        except MemcacheUnknownError:
            return None

    def set(self, key: str, value: Any, ttl: int = 0):
        try:
            self.client.set(key, json.dumps(value), expire=ttl)
        except MemcacheUnknownError:
            pass  # Silently fail if unable to set the value

    def clear(self):
        self.client.flush_all()
