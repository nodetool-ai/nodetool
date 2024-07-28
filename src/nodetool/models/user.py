from nodetool.common.environment import Environment
from typing import Any, Optional
from datetime import datetime, timedelta
from validate_email import validate_email
import logging
import random
import uuid
from typing import Optional
from datetime import datetime, timedelta
import uuid
import random

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from nodetool.models.condition_builder import Field

log = logging.getLogger(__name__)

TOKEN_LIFETIME_DAYS = 180


class User(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {"table_name": "nodetool_users"}

    id: str = DBField(hash_key=True)
    permissions: dict[str, Any] | None = DBField(default=None)
    email: str = DBField(default="")
    passcode: str = DBField(default="")
    auth_token: str | None = DBField(default=None)
    verified_at: datetime | None = DBField(default=None)
    passcode_valid: datetime = DBField(default_factory=datetime.now)
    token_valid: datetime | None = DBField(default=None)
    created_at: datetime = DBField(default_factory=datetime.now)
    updated_at: datetime = DBField(default_factory=datetime.now)
    deleted_at: datetime | None = DBField(default=None)

    @classmethod
    def exists(cls, email: str) -> bool:
        """
        Check if a user exists in the database.

        Returns:
            True if the user exists, False otherwise.
        """
        users, _ = cls.query(
            Field("email").equals(email.lower()),
        )
        return len(users) > 0

    @classmethod
    def find_by_email(cls, email: str) -> Optional["User"]:
        """
        Find a user by email.

        Returns:
            user object
        """
        users, _ = cls.query(
            Field("email").equals(email.lower()),
        )
        if len(users) == 0:
            return None
        return users[0]

    @classmethod
    def login_with_passcode(cls, email: str, passcode: str):
        """
        Login a user.
        The first time this will verifiy the email.

        Returns:
            user object
        """
        user = cls.find_by_email(email)

        if user is None:
            return None

        if passcode != user.passcode:
            return None

        if user.passcode_valid.replace(tzinfo=None) < datetime.now().replace(
            tzinfo=None
        ):
            return None

        if user.verified_at is None:
            log.info("Verifying email for %s", email)
            user.verified_at = datetime.now()

        # update token
        user.auth_token = uuid.uuid4().hex
        user.token_valid = datetime.now() + timedelta(days=1)
        user.save()

        log.info("Logging in %s", email)

        return user

    @classmethod
    def find_by_auth_token(cls, auth_token: str):
        """
        Find a user by auth token.

        Returns:
            user object
        """
        users, _ = cls.query(
            condition=Field("auth_token").equals(auth_token),
        )
        if len(users) == 0:
            return None

        user = users[0]

        # check if token is valid
        if user.token_valid is None:
            return None

        # check if token is expired
        if user.token_valid.replace(tzinfo=None) < datetime.now().replace(tzinfo=None):
            return None

        return user

    @classmethod
    def create(
        cls,
        email: str | None = None,
        verified: bool = False,
        auth_token: str | None = None,
        token_valid: datetime | None = None,
        passcode_valid: datetime | None = None,
        user_id: str | None = None,
    ):
        """
        Create a new user in the database.
        If the user already exists, return the existing user.
        """
        if email:
            if not validate_email(email):
                raise ValueError(f"`{email}` is invalid")
            u = User.find_by_email(email)
        elif user_id:
            u = User.get(user_id)
        else:
            u = None

        if user_id is None:
            user_id = create_time_ordered_uuid()

        if verified:
            auth_token = uuid.uuid4().hex
            token_valid = datetime.now() + timedelta(days=TOKEN_LIFETIME_DAYS)

        if Environment.use_remote_auth():
            passcode = str(random.randint(100000, 999999))
        else:
            passcode = "000000"

        if passcode_valid is None:
            passcode_valid = datetime.now() + timedelta(minutes=61)

        if u is None:
            user = super().create(
                id=user_id,
                email=email.lower() if email else "",
                passcode=passcode,
                passcode_valid=passcode_valid,
                created_at=datetime.now(),
                updated_at=datetime.now(),
                verified_at=datetime.now() if verified else None,
                auth_token=auth_token,
                token_valid=token_valid,
            )

            log.info("Created user %s", user_id)
            return user, True
        else:
            u.passcode = passcode
            u.passcode_valid = passcode_valid
            u.updated_at = datetime.now()
            if u.auth_token is None:
                u.auth_token = auth_token
            u.token_valid = token_valid
            u.save()
            return u, False
