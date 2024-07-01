from abc import ABC, abstractmethod
from typing import Any


class AbstractNodeCache(ABC):
    """
    An abstract base class defining the interface for node caching implementations.
    """

    @abstractmethod
    def get(self, key: str) -> Any:
        """
        Retrieve a value from the cache.

        Args:
            key (str): The key to retrieve.

        Returns:
            Any: The value associated with the key, or None if not found.
        """
        pass

    @abstractmethod
    def set(self, key: str, value: Any, ttl: int = 3600):
        """
        Set a value in the cache with an optional TTL.

        Args:
            key (str): The key to set.
            value (Any): The value to store.
            ttl (int, optional): Time-to-live in seconds. If None, the entry won't expire.
        """
        pass

    @abstractmethod
    def clear(self):
        """Clear the entire cache."""
        pass
