from abc import ABC
import json
import httpx
from typing import AsyncIterator, Dict, Any
from httpx import ASGITransport


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


class NodetoolAPIClient:
    auth_token: str
    base_url: str
    client: httpx.AsyncClient
    app: Any

    def __init__(self, auth_token: str, base_url: str, client: httpx.AsyncClient):
        self.auth_token = auth_token
        self.base_url = base_url
        self.client = client
        assert self.auth_token != "", "auth_token is required"

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

    async def get(self, path: str, **kwargs) -> Response:
        response = await self.client.get(
            self._get_url(path),
            headers=self._get_headers(),
            **kwargs,
        )
        response.raise_for_status()
        return Response.from_httpx(response)

    async def head(self, path: str, **kwargs) -> Response:
        response = await self.client.head(
            self._get_url(path),
            headers=self._get_headers(),
            **kwargs,
        )
        response.raise_for_status()
        return Response.from_httpx(response)

    async def stream(
        self,
        method: str,
        path: str,
        **kwargs,
    ) -> AsyncIterator[bytes]:
        async with self.client.stream(
            method,
            self._get_url(path),
            headers=self._get_headers(),
            **kwargs,
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                yield chunk

    async def post(self, path: str, **kwargs) -> Response:
        response = await self.client.post(
            self._get_url(path), headers=self._get_headers(), **kwargs
        )
        response.raise_for_status()
        return Response.from_httpx(response)

    async def put(self, path: str, **kwargs) -> Response:
        response = await self.client.put(
            self._get_url(path), headers=self._get_headers(), **kwargs
        )
        response.raise_for_status()
        return Response.from_httpx(response)

    async def delete(self, path: str) -> Response:
        response = await self.client.delete(
            self._get_url(path), headers=self._get_headers()
        )
        response.raise_for_status()
        return Response.from_httpx(response)
