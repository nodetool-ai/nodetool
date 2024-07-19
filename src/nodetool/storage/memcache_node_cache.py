import json
from typing import Any
from pymemcache import Client
from pymemcache.serde import PickleSerde
from pymemcache.exceptions import MemcacheUnknownError
from nodetool.metadata.types import BaseType
from .abstract_node_cache import AbstractNodeCache


class MemcachedNodeCache(AbstractNodeCache):
    """
    A class to manage caching of node results across multiple WorkflowRunner instances,
    using Memcached as the backend.
    """

    def __init__(self, host="localhost", port=11211):
        self.client = Client(
            (host, port),
            serde=PickleSerde(),
        )

    def get(self, key: str) -> Any:
        try:
            return self.client.get(key)
        except MemcacheUnknownError:
            return None

    def set(self, key: str, value: Any, ttl: int = 0):
        try:
            self.client.set(key, value, expire=ttl)
        except MemcacheUnknownError:
            pass  # Silently fail if unable to set the value

    def clear(self):
        self.client.flush_all()
