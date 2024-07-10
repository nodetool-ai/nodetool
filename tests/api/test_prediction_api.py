import json
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from nodetool.metadata.types import Provider
from nodetool.types.prediction import PredictionCreateRequest, PredictionResult
from nodetool.models.prediction import Prediction as PredictionModel
from nodetool.models.user import User


@pytest.fixture
def test_prediction(user: User, client: TestClient):
    return PredictionModel.create(
        user_id=user.id,
        node_id="test_node_id",
        model="test_model",
        provider="test_provider",
    )


def test_get_predictions(
    user: User, test_prediction: PredictionModel, client: TestClient
):
    response = client.get(
        "/api/predictions/", headers={"Authorization": f"Bearer {user.auth_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "predictions" in data
    assert len(data["predictions"]) == 1
    assert data["predictions"][0]["id"] == test_prediction.id


def test_get_prediction(
    user: User, test_prediction: PredictionModel, client: TestClient
):
    response = client.get(
        f"/api/predictions/{test_prediction.id}",
        headers={"Authorization": f"Bearer {user.auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_prediction.id


def test_get_nonexistent_prediction(client: TestClient, user: User):
    response = client.get(
        "/api/predictions/nonexistent_id",
        headers={"Authorization": f"Bearer {user.auth_token}"},
    )
    assert response.status_code == 404


def test_create_prediction(client: TestClient, user: User):
    req = PredictionCreateRequest(
        node_id="test_node_id",
        model="test_model",
        workflow_id="test_workflow_id",
        provider=Provider.HuggingFace,
    )

    res = client.post(
        "/api/predictions/",
        json=req.model_dump(),
        headers={"Authorization": f"Bearer {user.auth_token}"},
    )

    assert res.status_code == 200
    assert res.json()["id"] is not None
