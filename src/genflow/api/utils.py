from fastapi import (
    HTTPException,
    Header,
    status,
)
from pydantic import BaseModel
from typing import Optional
from fastapi import Cookie

from genflow.models.user import User


async def current_user(
    authorization: Optional[str] = Header(None),
    auth_cookie: Optional[str] = Cookie(None),
) -> User:
    if authorization:
        token = authorization.split(" ")[1]
        user = User.find_by_auth_token(token)
    elif auth_cookie:
        user = User.find_by_auth_token(auth_cookie)
    else:
        user = None

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    if user.verified_at is None:
        raise HTTPException(status_code=401, detail="User not verified")
    return user


async def abort(status_code: int, detail: Optional[str] = None) -> None:
    """
    Abort the current request with the given status code and detail.
    """
    raise HTTPException(status_code=status_code, detail=detail)
