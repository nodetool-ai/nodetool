import pytest
from genflow.models.message import Message
from genflow.models.user import User


def test_find_message(user: User):
    message = Message.create(
        user_id=user.id,
        thread_id="th1",
    )

    found_message = Message.get(message.id)

    if found_message:
        assert message.id == found_message.id
    else:
        pytest.fail("Message not found")

    # Test finding a message that does not exist in the database
    not_found_message = Message.get("invalid_id")
    assert not_found_message is None


def test_paginate_messages(user: User):
    Message.create(user_id=user.id, thread_id="th1")

    messages, last_key = Message.paginate(thread_id="th1", limit=10)
    assert len(messages) > 0
    assert last_key == ""


def test_create_message(user: User):
    message = Message.create(
        user_id=user.id,
        thread_id="th1",
    )

    assert Message.get(message.id) is not None
