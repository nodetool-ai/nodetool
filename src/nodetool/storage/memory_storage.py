from datetime import datetime
import io
from typing import Dict, Iterator
from nodetool.storage.abstract_storage import AbstractStorage


class MemoryStorage(AbstractStorage):
    storage: Dict[str, bytes]
    mtimes: Dict[str, datetime]
    base_url: str

    def __init__(self, base_url: str):
        self.storage = {}
        self.mtimes = {}
        self.base_url = base_url

    def generate_presigned_url(
        self, client_method: str, object_name: str, expiration=3600 * 24 * 7
    ) -> str:
        return f"{self.base_url}/{object_name}"

    def file_exists(self, file_name: str) -> bool:
        return file_name in self.storage

    def get_mtime(self, key: str):
        return self.mtimes.get(key, datetime.now())

    def download(self, key: str, stream: io.BytesIO):
        if key in self.storage:
            stream.write(self.storage[key])

    def download_stream(self, key: str) -> Iterator[bytes]:
        if key in self.storage:
            yield self.storage[key]

    def upload(self, key: str, content: io.BytesIO) -> str:
        self.storage[key] = content.read()
        self.mtimes[key] = datetime.now()
        return self.generate_presigned_url("get_object", key)

    def upload_stream(self, key: str, content: Iterator[bytes]) -> str:
        bytes_io = io.BytesIO()
        for chunk in content:
            bytes_io.write(chunk)
        bytes_io.seek(0)
        self.storage[key] = bytes_io.getvalue()
        return self.generate_presigned_url("get_object", key)

    async def download_async(self, key: str, stream: io.BytesIO):
        if key in self.storage:
            stream.write(self.storage[key])

    async def upload_async(self, key: str, content: io.BytesIO) -> str:
        self.storage[key] = content.read()
        return self.generate_presigned_url("get_object", key)

    def delete(self, file_name: str):
        if file_name in self.storage:
            del self.storage[file_name]
