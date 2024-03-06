from fastapi.testclient import TestClient
from genflow.models.user import User


def test_validate_token(client: TestClient):
    user, _ = User.create("test@email.com")
    body = {"email": user.email, "passcode": user.passcode}
    response = client.post("/api/auth/login", json=body)

    # token has changed
    user = User.get(user.id)
    assert user is not None
    response = client.post("/api/auth/validate-token", json={"token": user.auth_token})

    assert response.status_code == 200
    assert response.json() == {"valid": True}
