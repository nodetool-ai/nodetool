#!/usr/bin/env python

from logging import Logger
from typing import IO, Any, AsyncIterator, Iterator

import httpx
from .abstract_storage import AbstractStorage

from nodetool.models.asset import Asset


class S3Storage(AbstractStorage):
    """
    This class, named `S3Storage`, is an implementation of the `AbstractStorage` class
    specifically designed to interact with Amazon S3 (Simple Storage Service) or
    compatible storage systems.

    The main purpose of this class is to provide methods for uploading, downloading,
    and deleting files (referred to as "objects" in S3 terminology) from an S3 bucket.
    It uses presigned URLs to perform these operations securely without exposing the
    actual S3 credentials.
    """

    bucket_name: str
    client: Any
    log: Logger
    endpoint_url: str | None = None
    domain: str | None = None

    def __init__(
        self,
        bucket_name: str,
        client: Any,
        log: Logger,
        endpoint_url: str | None = None,
        domain: str | None = None,
    ):
        self.bucket_name = bucket_name
        self.client = client
        self.log = log
        self.endpoint_url = endpoint_url
        self.domain = domain

    def get_base_url(self):
        """
        Get the base URL for the S3 bucket.
        """
        return f"{self.endpoint_url}/{self.bucket_name}"

    def get_url(self, key: str):
        """
        Get the URL for the given S3 object.
        """
        if self.domain:
            return f"https://{self.domain}/{key}"
        else:
            return f"{self.endpoint_url}/{self.bucket_name}/{key}"

    def generate_presigned_url(
        self,
        client_method: str,
        object_name: str,
        expiration=3600 * 24 * 7,
    ):
        """
        Generate a presigned URL for the given S3 object.
        """
        if self.endpoint_url and self.endpoint_url.startswith("http://localhost"):
            return f"{self.endpoint_url}/{self.bucket_name}/{object_name}"

        response = self.client.generate_presigned_url(
            client_method,
            Params={"Bucket": self.bucket_name, "Key": object_name},
            ExpiresIn=expiration,
        )

        return response

    async def file_exists(self, file_name: str) -> bool:
        """
        Check if an asset exists in S3.
        """
        url = self.generate_presigned_url("head_object", file_name)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.head(url)
                response.raise_for_status()

            return True
        except:
            return False

    async def get_mtime(self, key: str):
        """
        Get the last modified time of the file.
        """
        url = self.generate_presigned_url("head_object", key)

        async with httpx.AsyncClient() as client:
            response = await client.head(url)
            response.raise_for_status()

            last_modified = response.headers.get("last-modified")
            return last_modified

    async def download(self, key: str, stream: IO):
        """
        Downloads a blob from the bucket.
        """
        url = self.get_url(key)
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()

                async for chunk in response.aiter_bytes():
                    stream.write(chunk)

    async def upload(self, key: str, content: IO):
        """
        Uploads a blob to the bucket.
        """
        url = self.generate_presigned_url("put_object", key)

        async with httpx.AsyncClient() as client:
            response = await client.put(url, content=content.read())
            response.raise_for_status()

        return self.get_url(key)

    async def download_stream(self, key: str) -> AsyncIterator[bytes]:
        """
        Downloads a blob from the bucket as a stream.
        """
        url = self.get_url(key)

        async with httpx.AsyncClient() as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    yield chunk

    async def delete(self, file_name: str):
        url = self.generate_presigned_url("delete_object", file_name)
        async with httpx.AsyncClient() as client:
            response = await client.delete(url)
            response.raise_for_status()
