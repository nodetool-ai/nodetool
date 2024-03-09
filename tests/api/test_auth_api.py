from genflow.api.auth import (
    OAuthAuthorizeRequest,
    OAuthLoginRequest,
    OAuthProvider,
    get_user_email,
)
from genflow.models.user import User

import pytest
from fastapi.testclient import TestClient


def test_oauth_login(mocker, client: TestClient):
    # Test successful OAuth login
    mock_session = mocker.patch(
        "genflow.api.auth.Environment.get_google_oauth2_session"
    )
    mock_session.return_value.create_authorization_url.return_value = (
        "http://localhost:8000/auth",
        "test_state",
    )
    login_request = OAuthLoginRequest(
        redirect_uri="http://localhost:8000/callback", provider=OAuthProvider.google
    )
    response = client.post("/api/auth/oauth/login", json=login_request.model_dump())
    assert mock_session.return_value.create_authorization_url.called
    assert response.status_code == 200
    assert "url" in response.json()
    assert "state" in response.json()


def test_oauth_callback(mocker, client: TestClient):
    # Mock the OAuth2Session and get_user_email function
    mock_session = mocker.patch(
        "genflow.api.auth.Environment.get_google_oauth2_session"
    )
    mock_get_user_email = mocker.patch("genflow.api.auth.get_user_email")
    mock_get_user_email.return_value = "test@example.com"

    # Test successful OAuth callback
    auth_request = OAuthAuthorizeRequest(
        provider=OAuthProvider.google,
        state="test_state",
        authorization_response="test_response",
        redirect_uri="http://localhost:8000/callback",
    )
    response = client.post("/api/auth/oauth/callback", json=auth_request.model_dump())

    assert mock_session.return_value.fetch_token.called
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
    assert "id" in response.json()
    assert "auth_token" in response.json()

    # Verify that the user is created or retrieved correctly
    user = User.find_by_email("test@example.com")
    assert user is not None
    assert user.email == "test@example.com"
    assert user.verified_at is not None


def test_get_user_email(mocker):
    # Mock the OAuth2Session
    mock_session = mocker.MagicMock()
    mock_session.get.return_value.json.return_value = {"email": "test@example.com"}

    # Test getting user email for Google provider
    email = get_user_email(mock_session, OAuthProvider.google)
    assert email == "test@example.com"
