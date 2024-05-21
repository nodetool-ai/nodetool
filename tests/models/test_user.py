from datetime import datetime, timedelta
import uuid
from nodetool.common.environment import Environment
from nodetool.models.user import (
    User,
)


def make_user(verified: bool = False) -> User:
    user = User(
        id=uuid.uuid4().hex,
        email=uuid.uuid4().hex + "@a.de",
        auth_token=uuid.uuid4().hex,
        token_valid=datetime.now() + timedelta(days=1),
        passcode="123",
        passcode_valid=datetime.now() + timedelta(days=1),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        verified_at=datetime.now() if verified else None,
    )
    user.save()
    return user


def test_user_exists():
    user = make_user()

    assert User.exists(user.email)
    assert not User.exists("nonexistent_email@example.com")


def test_login_with_passcode():
    user = make_user()
    logged_in_user = User.login_with_passcode(user.email, user.passcode)

    assert logged_in_user is not None
    if logged_in_user:
        assert logged_in_user.id == user.id


def test_login_with_wrong_passcode():
    user = make_user()
    logged_in_user = User.login_with_passcode(user.email, "invalid_passcode")

    assert logged_in_user is None


def test_find_user_by_auth_token():
    user = make_user()
    found_user = User.find_by_auth_token(user.auth_token or "")

    assert found_user is not None
    assert found_user.id == user.id


def test_find_user_by_invalid_auth_token():
    found_user = User.find_by_auth_token("invalid_token")

    assert found_user is None


def random_email():
    id = uuid.uuid4().hex
    return f"test{id}@email.com"


def test_create_user():
    email = random_email()
    user, created = User.create(email)

    assert created
    assert user.id is not None
    assert user.auth_token is None
    assert user.passcode is not None
    assert user.email == email

    existing_user, created = User.create(email)
    assert not created
    assert existing_user.id == user.id


def test_create_verified_user():
    email = random_email()
    user, created = User.create(email, verified=True)

    assert created
    assert user.id is not None
    assert user.auth_token is not None
    assert user.token_valid is not None
    assert user.passcode is not None
    assert user.email == email
    assert user.verified_at is not None


def test_find_user_by_email():
    user = make_user()
    found_user = User.find_by_email(user.email)

    assert found_user is not None
    if found_user:
        assert found_user.id == user.id


def test_find_user_by_invalid_email():
    found_user = User.find_by_email("nonexistent_email@example.com")

    assert found_user is None


def test_case_insensitivity_in_email():
    email = random_email()
    user, created = User.create(email)
    assert created

    # Try to create a new user with the same email but different letter casing
    existing_user, created = User.create(email.upper())
    assert not created

    # Assert that both email addresses refer to the same user
    assert user.id == existing_user.id

    # Check if the user can log in with the uppercase email
    logged_in_user = User.login_with_passcode(email.upper(), existing_user.passcode)
    assert logged_in_user is not None
    if logged_in_user:
        assert logged_in_user.id == user.id
