from abc import ABC
import httpx
from typing import Dict, Any
from fastapi.testclient import TestClient


class AbstractNodetoolAPIClient(ABC):
    async def get(self, endpoint: str, params: dict | None = None) -> Dict[str, Any]:
        raise NotImplementedError()

    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        raise NotImplementedError()

    async def put(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError()

    async def delete(self, endpoint: str) -> Dict[str, Any]:
        raise NotImplementedError()


class NodetoolAPIClient(AbstractNodetoolAPIClient):
    auth_token: str
    base_url: str

    def __init__(self, auth_token: str, base_url: str):
        self.auth_token = auth_token
        self.base_url = base_url

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
        }

    async def get(self, endpoint: str, params: dict | None = None) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()

    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, **kwargs)
            response.raise_for_status()
            return response.json()

    async def put(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.put(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()

    async def delete(self, endpoint: str) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=headers)
            response.raise_for_status()
            return response.json()


class NodetoolAPITestClient(AbstractNodetoolAPIClient):
    auth_token: str
    base_url: str
    client: TestClient

    def __init__(self, auth_token: str, client: TestClient):
        print("using token", auth_token)
        self.base_url = "/api"
        self.auth_token = auth_token
        self.client = client

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
        }

    async def get(self, endpoint: str, params: dict | None = None) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        response = self.client.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()

    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        response = self.client.post(url, headers=headers, **kwargs)
        response.raise_for_status()
        return response.json()

    async def put(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        response = self.client.put(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()

    async def delete(self, endpoint: str) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        response = self.client.delete(url, headers=headers)
        response.raise_for_status()
        return response.json()
