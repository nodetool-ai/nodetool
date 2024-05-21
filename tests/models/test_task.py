import pytest
from nodetool.models.task import Task
from nodetool.models.user import User


def test_find_task(user: User):
    task = Task.create(
        user_id=user.id,
        thread_id="th1",
        name="Test Task",
        instructions="Do something",
    )

    found_task = Task.find(user.id, task.id)

    if found_task:
        assert task.id == found_task.id
    else:
        pytest.fail("Task not found")

    # Test finding a task that does not exist in the database
    not_found_task = Task.find(user.id, "invalid_id")
    assert not_found_task is None


def test_create_task(user: User):
    task = Task.create(
        user_id=user.id,
        thread_id="th1",
        name="Test Task",
        instructions="Do something",
    )

    assert Task.get(task.id) is not None


def test_paginate_tasks(user: User):
    for i in range(5):
        Task.create(
            user_id=user.id,
            thread_id="th1",
            name=f"Task {i}",
            instructions="Do something",
        )

    tasks, last_key = Task.paginate(thread_id="th1", limit=3)
    assert len(tasks) > 0

    tasks, last_key = Task.paginate(thread_id="th1", limit=3, start_key=last_key)
    assert len(tasks) > 0


def test_paginate_tasks_by_thread(user: User):
    for i in range(5):
        Task.create(
            user_id=user.id,
            thread_id="th1",
            name=f"Task {i}",
            instructions="Do something",
        )

    for i in range(5):
        Task.create(
            user_id=user.id,
            thread_id="th2",
            name=f"Task {i}",
            instructions="Do something",
        )

    tasks, last_key = Task.paginate(thread_id="th1", limit=4)
    assert len(tasks) == 4

    tasks, last_key = Task.paginate(thread_id="th1", limit=4, start_key=last_key)
    assert len(tasks) == 1

    tasks, last_key = Task.paginate(thread_id="th2", limit=4)
    assert len(tasks) == 4

    tasks, last_key = Task.paginate(thread_id="th2", limit=4, start_key=last_key)
    assert len(tasks) == 1
