from abc import ABC, abstractmethod
from typing import IO, Iterator
from datetime import datetime


class AbstractStorage(ABC):

    @abstractmethod
    def generate_presigned_url(
        self, client_method: str, object_name: str, expiration=3600 * 24 * 7
    ) -> str:
        pass

    @abstractmethod
    def file_exists(self, key: str) -> bool:
        pass

    @abstractmethod
    def get_mtime(self, key: str) -> datetime:
        pass

    @abstractmethod
    def download(self, key: str, stream: IO):
        pass

    @abstractmethod
    def download_stream(self, key: str) -> Iterator[bytes]:
        pass

    @abstractmethod
    def upload(self, key: str, content: IO) -> str:
        pass

    @abstractmethod
    async def download_async(self, key: str, stream: IO):
        pass

    @abstractmethod
    async def upload_async(self, key: str, content: IO) -> str:
        pass

    @abstractmethod
    def delete(self, file_name: str):
        pass
