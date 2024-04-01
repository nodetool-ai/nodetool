from fastapi import (
    HTTPException,
    Header,
    status,
)
from pydantic import BaseModel
from typing import Optional
from fastapi import Cookie
from nodetool.common.environment import Environment

from nodetool.models.user import User

local_user: User | None = None

log = Environment.get_logger()


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
    if not Environment.use_remote_auth():
        return get_local_user()

    if authorization:
        token_split = authorization.split(" ")
        if len(token_split) != 2 or token_split[0].lower() != "bearer":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

        user = User.find_by_auth_token(token_split[1])
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
