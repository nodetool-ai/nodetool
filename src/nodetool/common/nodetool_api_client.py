from contextlib import asynccontextmanager
import json
import httpx
from typing import AsyncGenerator, Dict, Any


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
        json: dict[str, Any] | None = None,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        # Special case for running predictions
        # This is a hack to work around the fact that
        # ASGITransport does not support streaming responses
        if (
            self.base_url == NODETOOL_INTERNAL_API
            and method == "POST"
            and path == "api/predictions/"
        ):
            # avoid circular import
            from nodetool.api.types.prediction import PredictionCreateRequest
            from nodetool.api.prediction import run_prediction

            assert json is not None, "json is required"
            req = PredictionCreateRequest(**json)
            async for msg in run_prediction(req, self.user_id):
                print(msg)
                yield msg.model_dump_json() + "\n"
        else:
            async with self.client.stream(
                method,
                self._get_url(path),
                headers=self._get_headers(),
                json=json,
                **kwargs,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    yield line

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
