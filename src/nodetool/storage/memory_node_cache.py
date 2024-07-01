from typing import Any
import time
from .abstract_node_cache import AbstractNodeCache


class MemoryNodeCache(AbstractNodeCache):
    """
    A class to manage caching of node results across multiple WorkflowRunner instances,
    with support for Time-To-Live (TTL) for cached items.
    """

    def __init__(self):
        self.cache = {}

    def get(self, key: str) -> Any:
        if key in self.cache:
            value, expiry_time = self.cache[key]
            if expiry_time is None or time.time() < expiry_time:
                return value
            else:
                del self.cache[key]  # Remove expired entry
        return None

    def set(self, key: str, value: Any, ttl: int = 3600):
        expiry_time = time.time() + ttl
        self.cache[key] = (value, expiry_time)

    def clear(self):
        self.cache.clear()

    def generate_cache_key(self, node_class: str, properties: dict) -> str:
        return f"{node_class}:{hash(repr(properties))}"
