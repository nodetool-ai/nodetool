from random import randint
import pytest
from fastapi.testclient import TestClient
from genflow.models.user import User


def test_login_authorized(client: TestClient):
    id = randint(0, 100000)
    user, _ = User.create(f"test_{id}@email.com")
    body = {"email": user.email, "passcode": user.passcode}
    response = client.post("/api/auth/login", json=body)
    json = response.json()

    # token has changed
    user = User.get(user.id)
    assert user is not None

    assert response.status_code == 200
    assert json["id"] == user.id
    assert json["auth_token"] == user.auth_token
    assert json["email"] == user.email


def test_login_unauthorized(client: TestClient):
    body = {"email": "a@a.de", "passcode": "1234"}
    response = client.post("/api/auth/login", json=body)

    assert response.status_code == 400


def test_signup_existing(client: TestClient):
    id = randint(0, 100000)
    user, _ = User.create(f"test_{id}@email.com")
    user.save()

    response = client.post("/api/auth/signup", json={"email": user.email})

    assert response.status_code == 200
    assert response.json()["id"] == user.id
    assert response.json()["email"] == user.email

    user = User.get(user.id)
    assert user is not None
    assert user.passcode != ""


def test_signup(client: TestClient):
    id = randint(0, 100000)
    response = client.post("/api/auth/signup", json={"email": f"test_{id}@email.com"})

    assert response.status_code == 200

    user = User.find_by_email(response.json()["email"])
    if user:
        assert user.verified_at is None
        assert response.json()["id"] == user.id
        assert response.json()["email"] == user.email
    else:
        pytest.fail("User not created")


def test_login_incorrect_passcode(client: TestClient):
    user, _ = User.create("test@email.com")
    body = {"email": user.email, "passcode": "incorrect_passcode"}
    response = client.post("/api/auth/login", json=body)

    assert response.status_code == 400


def test_login_non_existent_email(client: TestClient):
    body = {"email": "non_existent@email.com", "passcode": "1234"}
    response = client.post("/api/auth/login", json=body)

    assert response.status_code == 400


def test_login_missing_email(client: TestClient):
    body = {"passcode": "1234"}
    response = client.post("/api/auth/login", json=body)

    assert response.status_code == 422


def test_login_missing_passcode(client: TestClient):
    user, _ = User.create("test@email.com")
    body = {"email": user.email}
    response = client.post("/api/auth/login", json=body)

    assert response.status_code == 422


def test_signup_invalid_email_format(client: TestClient):
    response = client.post("/api/auth/signup", json={"email": "invalid_email_format"})

    assert response.status_code == 422


def test_signup_missing_email(client: TestClient):
    response = client.post("/api/auth/signup", json={})

    assert response.status_code == 422


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
