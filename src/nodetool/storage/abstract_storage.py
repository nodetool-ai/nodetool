from abc import ABC, abstractmethod
from typing import IO, AsyncIterator, Iterator
from datetime import datetime


class AbstractStorage(ABC):

    @abstractmethod
    def get_base_url(self) -> str:
        pass

    @abstractmethod
    def get_url(self, key: str) -> str:
        pass

    @abstractmethod
    async def file_exists(self, key: str) -> bool:
        pass

    @abstractmethod
    async def get_mtime(self, key: str) -> datetime:
        pass

    @abstractmethod
    def download_stream(self, key: str) -> AsyncIterator[bytes]:
        pass

    @abstractmethod
    async def download(self, key: str, stream: IO):
        pass

    @abstractmethod
    async def upload(self, key: str, content: IO) -> str:
        pass

    @abstractmethod
    async def delete(self, file_name: str):
        pass
