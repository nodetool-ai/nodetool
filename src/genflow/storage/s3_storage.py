#!/usr/bin/env python

from logging import Logger
from typing import IO, Any, Iterator

import httpx
from .abstract_storage import AbstractStorage

from genflow.models.asset import Asset


class S3Storage(AbstractStorage):
    bucket_name: str
    client: Any
    log: Logger
    endpoint_url: str | None = None

    def __init__(
        self, bucket_name: str, client, log: Logger, endpoint_url: str | None = None
    ):
        self.bucket_name = bucket_name
        self.client = client
        self.log = log
        self.endpoint_url = endpoint_url

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

    def file_exists(self, file_name: str) -> bool:
        """
        Check if an asset exists in S3.
        """
        url = self.generate_presigned_url("head_object", file_name)
        try:
            with httpx.Client() as client:
                response = client.head(url)
                response.raise_for_status()

            return True
        except:
            return False

    def download(self, key: str, stream: IO):
        """
        Downloads a blob from the bucket.
        """
        url = self.generate_presigned_url("get_object", key)

        with httpx.Client() as client:
            with client.stream("GET", url) as response:
                # Ensure the response is successful
                response.raise_for_status()

                # Read the content and write to the destination file
                for chunk in response.iter_bytes():
                    stream.write(chunk)

        self.log.info(
            "Downloaded storage object {} from bucket {}.".format(key, self.bucket_name)
        )

    def upload(self, key: str, content: IO):
        url = self.generate_presigned_url("put_object", key)
        with httpx.Client() as client:
            # Ensure the source file is read in chunks to avoid loading it entirely into memory
            content_generator = (chunk for chunk in content)

            # Perform a PUT request with the content generator as the body
            response = client.put(url, content=content_generator)

            # Ensure the request was successful
            response.raise_for_status()

            self.log.info(
                "Uploaded object {} to bucket {}.".format(key, self.bucket_name)
            )
            return self.generate_presigned_url("get_object", key)

    async def download_async(self, key: str, stream: IO):
        url = self.generate_presigned_url("get_object", key)
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()

                async for chunk in response.aiter_bytes():
                    stream.write(chunk)

    async def upload_async(self, key: str, content: IO):
        # Generate the presigned URL for the object
        url = self.generate_presigned_url("put_object", key)

        async with httpx.AsyncClient() as client:
            # Use an asynchronous generator to read the file in chunks
            async def content_generator():
                while True:
                    chunk = content.read(1024 * 1024)  # Read in 1MB chunks
                    if not chunk:
                        break
                    yield chunk

            # Perform an asynchronous PUT request with the content generator
            response = await client.put(url, content=content_generator())

            # Ensure the request was successful
            response.raise_for_status()

        self.log.info("Uploaded object {} to bucket {}.".format(key, self.bucket_name))

        return self.generate_presigned_url("get_object", key)

    def download_stream(self, key: str) -> Iterator[bytes]:
        url = self.generate_presigned_url("get_object", key)

        with httpx.Client() as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()

                for chunk in response.iter_bytes():
                    yield chunk

        self.log.info(
            "Downloaded storage object {} from bucket {}.".format(key, self.bucket_name)
        )

    def upload_stream(self, key: str, content: Iterator[bytes]):
        url = self.generate_presigned_url("put_object", key)

        with httpx.Client() as client:
            response = client.put(url, content=content)

        response.raise_for_status()

    def delete(self, file_name: str):
        url = self.generate_presigned_url("delete_object", file_name)
        with httpx.Client() as client:
            response = client.delete(url)
            response.raise_for_status()
            self.log.info(
                "Deleted object {} from bucket {}.".format(file_name, self.bucket_name)
            )
