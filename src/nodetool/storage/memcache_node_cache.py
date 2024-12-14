import json
from typing import Any
from pymemcache import Client
from pymemcache.serde import PickleSerde
from pymemcache.exceptions import MemcacheUnknownError
import torch
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
        
    def move_to_device(self, value: Any, device: str) -> Any:
        if isinstance(value, dict):
            return {k: self.move_to_device(v, device) for k, v in value.items()}
        if isinstance(value, list):
            return [self.move_to_device(v, device) for v in value]
        if isinstance(value, torch.Tensor):
            return value.to(device)
        return value

    def get(self, key: str) -> Any:
        try:
            return self.client.get(key)
        except MemcacheUnknownError:
            return None

    def set(self, key: str, value: Any, ttl: int = 0):
        try:
            value = self.move_to_device(value, "cpu")
            self.client.set(key, value, expire=ttl)
        except MemcacheUnknownError:
            pass  # Silently fail if unable to set the value

    def clear(self):
        self.client.flush_all()
