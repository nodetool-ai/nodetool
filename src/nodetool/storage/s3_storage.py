import asyncio
from logging import Logger
from typing import IO, Any, AsyncIterator

import boto3
from botocore.exceptions import ClientError

from .abstract_storage import AbstractStorage
from nodetool.models.asset import Asset


class S3Storage(AbstractStorage):
    """
    This class, named `S3Storage`, is an implementation of the `AbstractStorage` class
    specifically designed to interact with Amazon S3 (Simple Storage Service) or
    compatible storage systems using boto3 with asyncio for asynchronous operations.

    The main purpose of this class is to provide methods for uploading, downloading,
    and deleting files (referred to as "objects" in S3 terminology) from an S3 bucket.
    """

    def __init__(
        self,
        bucket_name: str,
        endpoint_url: str,
        client: Any,
        domain: str | None = None,
    ):
        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url
        self.domain = domain
        self.s3 = client

    def get_base_url(self):
        """
        Get the base URL for the S3 bucket.
        """
        return f"https://{self.bucket_name}.s3.{self.s3.meta.region_name}.amazonaws.com"

    def get_url(self, key: str):
        """
        Get the URL for the given S3 object.
        """
        if self.domain:
            return f"https://{self.domain}/{key}"
        else:
            return f"{self.get_base_url()}/{key}"

    async def file_exists(self, file_name: str) -> bool:
        """
        Check if an asset exists in S3.
        """
        try:
            await asyncio.to_thread(
                self.s3.head_object, Bucket=self.bucket_name, Key=file_name
            )
            return True
        except ClientError:
            return False

    async def get_mtime(self, key: str):
        """
        Get the last modified time of the file.
        """
        response = await asyncio.to_thread(
            self.s3.head_object, Bucket=self.bucket_name, Key=key
        )
        return response["LastModified"]

    async def download(self, key: str, stream: IO):
        """
        Downloads a blob from the bucket.
        """
        response = await asyncio.to_thread(
            self.s3.get_object, Bucket=self.bucket_name, Key=key
        )
        body = response["Body"]
        for chunk in body.iter_chunks(chunk_size=8192):
            stream.write(chunk)

    async def upload(self, key: str, content: IO):
        """
        Uploads a blob to the bucket.
        """
        await asyncio.to_thread(self.s3.upload_fileobj, content, self.bucket_name, key)
        return self.get_url(key)

    async def download_stream(self, key: str) -> AsyncIterator[bytes]:
        """
        Downloads a blob from the bucket as a stream.
        """
        response = await asyncio.to_thread(
            self.s3.get_object, Bucket=self.bucket_name, Key=key
        )
        body = response["Body"]
        for chunk in body.iter_chunks(chunk_size=8192):
            yield chunk

    async def delete(self, file_name: str):
        """
        Deletes a blob from the bucket.
        """
        await asyncio.to_thread(
            self.s3.delete_object, Bucket=self.bucket_name, Key=file_name
        )
