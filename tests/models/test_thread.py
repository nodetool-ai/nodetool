import pytest
from genflow.models.thread import Thread
from genflow.models.user import User


def test_find_thread(user: User):
    thread = Thread.create(
        id="th1",
        assistant_id="ast",
        user_id=user.id,
    )

    found_thread = Thread.get(thread.id)

    if found_thread:
        assert thread.id == found_thread.id
    else:
        pytest.fail("Thread not found")

    # Test finding a thread that does not exist in the database
    not_found_thread = Thread.get("invalid_id")
    assert not_found_thread is None


def test_paginate_threads(user: User):
    Thread.create(id="th", assistant_id="ast", user_id=user.id)

    threads, last_key = Thread.paginate(assistant_id="ast", user_id=user.id, limit=10)
    assert len(threads) > 0
    assert last_key == ""


def test_create_thread(user: User):
    thread = Thread.create(
        id="th1",
        assistant_id="ast",
        user_id=user.id,
    )

    assert Thread.get(thread.id) is not None
