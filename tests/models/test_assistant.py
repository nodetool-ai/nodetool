import pytest
from genflow.models.assistant import (
    Assistant,
)

from genflow.models.user import User


def test_find_assistant(user: User):
    assistant = Assistant.create(
        id="as1",
        user_id=user.id,
    )

    found_assistant = Assistant.get(assistant.id)

    if found_assistant:
        assert assistant.id == found_assistant.id
    else:
        pytest.fail("Assistant not found")

    # Test finding an assistant that does not exist in the database
    not_found_assistant = Assistant.get("invalid_id")
    assert not_found_assistant is None


def test_paginate_assistants(user: User):
    Assistant.create(id="as", user_id=user.id)

    assistants, last_key = Assistant.paginate(user_id=user.id, limit=10)
    assert len(assistants) > 0
    assert last_key == ""


def test_create_assistant(user: User):
    assistant = Assistant.create(
        id="as1",
        user_id=user.id,
    )

    assert Assistant.get(assistant.id) is not None
