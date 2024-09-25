import pytest
from nodetool.models.message import Message
from nodetool.models.user import User


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


def test_create_message_image_content(user: User):
    message = Message.create(
        user_id=user.id,
        thread_id="th1",
        content=[
            {
                "type": "image_url",
                "image": {"type": "image", "uri": "https://example.com/image.jpg"},
            }
        ],
    )

    assert Message.get(message.id) is not None
    assert message.content is not None
    assert type(message.content) == list
    assert len(message.content) == 1
    assert message.content[0].type == "image_url"
    assert message.content[0].image.uri == "https://example.com/image.jpg"


def test_create_message_mixed_content(user: User):
    message = Message.create(
        user_id=user.id,
        thread_id="th1",
        content=[
            {"type": "text", "text": "Hello"},
            {
                "type": "image_url",
                "image": {"type": "image", "uri": "https://example.com/image.jpg"},
            },
        ],
    )

    assert Message.get(message.id) is not None

    assert message.content is not None
    assert type(message.content) == list
    assert len(message.content) == 2
    assert message.content[0].type == "text"
    assert message.content[0].text == "Hello"
    assert message.content[1].type == "image_url"
    assert message.content[1].image.uri == "https://example.com/image.jpg"
