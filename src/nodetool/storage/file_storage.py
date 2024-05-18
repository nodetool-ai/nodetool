from datetime import datetime
import os
import shutil
import aiofiles
from typing import IO, Iterator

from nodetool.storage.abstract_storage import AbstractStorage


class FileStorage(AbstractStorage):
    base_path: str
    base_url: str

    def __init__(self, base_path: str, base_url: str):
        self.base_path = base_path
        self.base_url = base_url
        print(self.base_url)
        os.makedirs(base_path, exist_ok=True)

    def generate_presigned_url(
        self, client_method: str, object_name: str, expiration=3600 * 24 * 7
    ):
        return f"{self.base_url}/{object_name}"

    def file_exists(self, file_name: str) -> bool:
        return os.path.isfile(os.path.join(self.base_path, file_name))

    def get_mtime(self, key: str):
        mtime = os.path.getmtime(os.path.join(self.base_path, key))
        return datetime.fromtimestamp(mtime, tz=datetime.now().astimezone().tzinfo)

    def download(self, key: str, stream: IO):
        with open(os.path.join(self.base_path, key), "rb") as f:
            shutil.copyfileobj(f, stream)

    def download_stream(self, key: str) -> Iterator[bytes]:
        with open(os.path.join(self.base_path, key), "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    def upload(self, key: str, content: IO) -> str:
        with open(os.path.join(self.base_path, key), "wb") as f:
            shutil.copyfileobj(content, f)
        return self.generate_presigned_url("get_object", key)

    def upload_stream(self, key: str, content: Iterator[bytes]) -> str:
        with open(os.path.join(self.base_path, key), "wb") as f:
            for chunk in content:
                f.write(chunk)
        return self.generate_presigned_url("get_object", key)

    async def download_async(self, key: str, stream: IO):
        async with aiofiles.open(os.path.join(self.base_path, key), "rb") as f:
            async for chunk in f:
                stream.write(chunk)

    async def upload_async(self, key: str, content: IO) -> str:
        async with aiofiles.open(os.path.join(self.base_path, key), "wb") as f:
            while True:
                chunk = content.read(1024 * 1024)  # Read in 1MB chunks
                if not chunk:
                    break
                await f.write(chunk)

        return self.generate_presigned_url("get_object", key)

    def delete(self, file_name: str):
        os.remove(os.path.join(self.base_path, file_name))
