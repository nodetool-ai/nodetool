from fastapi import (
    HTTPException,
    Header,
    status,
)
from pydantic import BaseModel
from typing import Optional
from fastapi import Cookie
from genflow.common.environment import Environment

from genflow.models.user import User

local_user: User | None = None

def get_local_user():
    """
    In local mode, we only need to create a single user.
    This single user has the ID 1.
    """
    global local_user
    if local_user is None:
        local_user = User.get(1)
        if local_user is None:
            local_user, _ = User.create(user_id="1", auth_token="local")
    return local_user


async def current_user(
    authorization: Optional[str] = Header(None),
    auth_cookie: Optional[str] = Cookie(None),
) -> User:
    if not Environment.is_production():
        return get_local_user()
    
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
