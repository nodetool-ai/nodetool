#!/usr/bin/env python

from enum import Enum
import re

from fastapi import APIRouter
from pydantic import BaseModel, validator
from authlib.integrations.requests_client import OAuth2Session

from nodetool.common.environment import Environment
from nodetool.models.user import User

log = Environment.get_logger()
router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    valid: bool


class OAuthLoginResponse(BaseModel):
    url: str
    state: str


class OAuthProvider(str, Enum):
    google = "google"
    facebook = "facebook"


class OAuthLoginRequest(BaseModel):
    redirect_uri: str
    provider: OAuthProvider


class OAuthAuthorizeRequest(BaseModel):
    provider: OAuthProvider
    state: str
    authorization_response: str
    redirect_uri: str


OAUTH_AUTHORIZATION_ENDPOINT = {
    OAuthProvider.google: "https://accounts.google.com/o/oauth2/v2/auth",
}

OAUTH_TOKEN_ENDPOINT = {
    OAuthProvider.google: "https://oauth2.googleapis.com/token",
}


def get_user_email(client: OAuth2Session, provider: OAuthProvider) -> str:
    if provider == OAuthProvider.google:
        return client.get("https://www.googleapis.com/oauth2/v1/userinfo").json()[
            "email"
        ]
    else:
        raise ValueError(f"Unknown provider: {provider}")


@router.post("/oauth/login")
async def oauth_login(login: OAuthLoginRequest) -> OAuthLoginResponse:
    authorization_endpoint = OAUTH_AUTHORIZATION_ENDPOINT[login.provider]
    client = Environment.get_google_oauth2_session()
    uri, state = client.create_authorization_url(
        authorization_endpoint, redirect_uri=login.redirect_uri
    )
    return OAuthLoginResponse(url=uri, state=state)


@router.post("/oauth/callback")
async def oauth_callback(auth: OAuthAuthorizeRequest) -> User:
    token_endpoint = OAUTH_TOKEN_ENDPOINT[auth.provider]
    client = Environment.get_google_oauth2_session()
    res = client.fetch_token(
        token_endpoint,
        state=auth.state,
        authorization_response=auth.authorization_response,
        redirect_uri=auth.redirect_uri,
        grant_type="authorization_code",
    )

    email = get_user_email(client, auth.provider)

    # email is trusted at this point
    user, created = User.create(email, verified=True)
    if created:
        log.info(f"Created user: {user.email}")
    else:
        log.info(f"User already exists: {user.email}")

    return User(email=user.email, id=user.id, auth_token=user.auth_token)


class AuthRequest(BaseModel):
    token: str


@router.post("/verify")
async def verify(auth: AuthRequest) -> TokenResponse:
    user = User.find_by_auth_token(auth.token)
    if user:
        return TokenResponse(valid=True)
    return TokenResponse(valid=False)
