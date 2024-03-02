from fastapi.testclient import TestClient


def test_metadata(client: TestClient):
    response = client.get("/api/nodes/metadata")
    assert response.status_code == 200
    assert len(response.json()) > 0
