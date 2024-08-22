import httpx


class WorkerAPIClient:
    base_url: str
    client: httpx.AsyncClient

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    def get_base_url(self):
        return self.base_url

    def _get_url(self, key: str):
        if key[0] == "/":
            key = key[1:]
        return f"{self.base_url}/{key}"

    async def get(self, path: str, **kwargs):
        return await self.client.get(
            self._get_url(path),
            **kwargs,
        )
