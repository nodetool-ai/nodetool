from contextlib import asynccontextmanager
import json
import httpx
from typing import AsyncGenerator, Dict, Any

"""
This module provides a client for interacting with the Nodetool API.

It defines a custom Response class to handle HTTP responses and a NodetoolAPIClient
class that encapsulates the logic for making authenticated requests to the Nodetool API.

The NodetoolAPIClient supports various HTTP methods (GET, HEAD, POST, PUT, DELETE)
and includes a special method for handling streaming responses. It also includes
error checking and custom header handling for authentication.

Classes:
    Response: A custom class to represent HTTP responses.
    NodetoolAPIClient: The main client class for interacting with the Nodetool API.

Constants:
    NODETOOL_INTERNAL_API: The base URL for internal API calls.
"""


class Response:
    """
    Represents an HTTP response.

    Attributes:
        content (bytes): The content of the response.
        status_code (int): The status code of the response.
        headers (Dict[str, str]): The headers of the response.
        media_type (str): The media type of the response.
    """

    content: bytes
    status_code: int
    headers: Dict[str, str]
    media_type: str

    def __init__(
        self, content: bytes, status_code: int, headers: Dict[str, str], media_type: str
    ):
        self.content = content
        self.status_code = status_code
        self.headers = headers
        self.media_type = media_type

    def json(self):
        return json.loads(self.content)

    @staticmethod
    def from_httpx(response: httpx.Response):
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.headers.get("Content-Type", "text/plain"),
        )


NODETOOL_INTERNAL_API = "http://127.0.0.1:123"


class NodetoolAPIClient:
    user_id: str
    auth_token: str
    base_url: str
    client: httpx.AsyncClient
    app: Any

    def __init__(
        self, user_id: str, auth_token: str, base_url: str, client: httpx.AsyncClient
    ):
        self.user_id = user_id
        self.auth_token = auth_token
        self.base_url = base_url
        self.client = client
        assert self.auth_token != "", "auth_token is required"
        print(f"Created NodetoolAPIClient for user {self.user_id} at {self.base_url}")

    def get_base_url(self):
        return self.base_url

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
        }

    def _get_url(self, key: str):
        if key[0] == "/":
            key = key[1:]
        return f"{self.base_url}/{key}"

    def check_status(self, response: httpx.Response):
        if response.status_code >= 400:
            client_info = f"user_id={self.user_id} len_token={len(self.auth_token)}"
            raise Exception(
                f"Error: {response.status_code} {response.content} {client_info}"
            )

    async def get(self, path: str, **kwargs) -> Response:
        response = await self.client.get(
            self._get_url(path),
            headers=self._get_headers(),
            **kwargs,
        )
        self.check_status(response)
        return Response.from_httpx(response)

    async def head(self, path: str, **kwargs) -> Response:
        response = await self.client.head(
            self._get_url(path),
            headers=self._get_headers(),
            **kwargs,
        )
        self.check_status(response)
        return Response.from_httpx(response)

    async def post(self, path: str, **kwargs) -> Response:
        response = await self.client.post(
            self._get_url(path), headers=self._get_headers(), **kwargs
        )
        self.check_status(response)
        return Response.from_httpx(response)

    async def put(self, path: str, **kwargs) -> Response:
        response = await self.client.put(
            self._get_url(path), headers=self._get_headers(), **kwargs
        )
        self.check_status(response)
        return Response.from_httpx(response)

    async def delete(self, path: str) -> Response:
        response = await self.client.delete(
            self._get_url(path), headers=self._get_headers()
        )
        self.check_status(response)
        return Response.from_httpx(response)
