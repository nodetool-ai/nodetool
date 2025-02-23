from nodetool.api.auth import (
    OAuthAuthorizeRequest,
    OAuthLoginRequest,
    OAuthProvider,
    get_user_email,
)
from nodetool.common.environment import Environment
from nodetool.models.user import User

import pytest
from fastapi.testclient import TestClient


def test_oauth_login(mocker, client: TestClient):
    """
    Test the OAuth login endpoint.

    Tests that:
    - The authorization URL is properly created
    - The response contains the expected URL and state
    - The response status code is correct

    Args:
        mocker: pytest mocker fixture
        client: FastAPI TestClient instance
    """
    # Test successful OAuth login
    mock_session = mocker.patch(
        "nodetool.api.auth.Environment.get_google_oauth2_session"
    )
    mock_session.return_value.create_authorization_url.return_value = (
        "http://localhost:8000/auth",
        "test_state",
    )
    login_request = OAuthLoginRequest(
        redirect_uri="http://localhost:8000/callback", provider=OAuthProvider.google
    )
    response = client.post("/api/auth/oauth/login", json=login_request.model_dump())

    assert (
        mock_session.return_value.create_authorization_url.called
    ), "create_authorization_url not called"
    assert response.status_code == 200, "response status code is not 200"
    assert "url" in response.json(), "url is not in response"
    assert "state" in response.json(), "state is not in response"


def test_oauth_callback(mocker, client: TestClient):
    """
    Test the OAuth callback endpoint.

    Tests that:
    - Token fetching works correctly
    - User creation/retrieval functions properly
    - Response contains expected user data and auth token
    - User is properly stored in the database with verified status

    Args:
        mocker: pytest mocker fixture
        client: FastAPI TestClient instance
    """
    # Mock the OAuth2Session and get_user_email function
    mock_session = mocker.patch(
        "nodetool.api.auth.Environment.get_google_oauth2_session"
    )
    mock_get_user_email = mocker.patch("nodetool.api.auth.get_user_email")
    mock_get_user_email.return_value = "test@example.com"

    # Test successful OAuth callback
    auth_request = OAuthAuthorizeRequest(
        provider=OAuthProvider.google,
        state="test_state",
        authorization_response="test_response",
        redirect_uri="http://localhost:8000/callback",
    )
    response = client.post("/api/auth/oauth/callback", json=auth_request.model_dump())

    assert mock_session.return_value.fetch_token.called, "fetch_token not called"
    assert response.status_code == 200, "response status code is not 200"
    assert response.json()["email"] == "test@example.com", "email is not correct"
    assert "id" in response.json(), "id is not in response"
    assert "auth_token" in response.json(), "auth_token is not in response"

    # Verify that the user is created or retrieved correctly
    user = User.find_by_email("test@example.com")
    assert user is not None
    assert user.email == "test@example.com"
    assert user.verified_at is not None


def test_get_user_email(mocker):
    """
    Test the get_user_email utility function.

    Tests that the function correctly extracts the email from
    the OAuth provider's user info endpoint response.

    Args:
        mocker: pytest mocker fixture
    """
    # Mock the OAuth2Session
    mock_session = mocker.MagicMock()
    mock_session.get.return_value.json.return_value = {"email": "test@example.com"}

    # Test getting user email for Google provider
    email = get_user_email(mock_session, OAuthProvider.google)
    assert email == "test@example.com", "email is not correct"
