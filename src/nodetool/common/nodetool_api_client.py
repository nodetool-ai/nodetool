import httpx
from typing import Dict, Any


class NodetoolAPIClient:
    auth_token: str
    base_url: str

    def __init__(self, auth_token: str, base_url: str):
        self.auth_token = auth_token
        self.base_url = base_url

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json",
        }

    async def get(self, endpoint: str, params: dict | None = None) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()

    async def post(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()

    async def put(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.put(url, headers=headers, json=data)
            print(response.json())
            response.raise_for_status()
            return response.json()

    async def delete(self, endpoint: str) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=headers)
            response.raise_for_status()
            return response.json()
