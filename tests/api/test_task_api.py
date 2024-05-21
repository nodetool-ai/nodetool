from fastapi.testclient import TestClient
from nodetool.api.types.chat import TaskCreateRequest, TaskUpdateRequest
from nodetool.models.task import Task
from nodetool.models.user import User


def test_create_task(client: TestClient, user: User, headers: dict[str, str]):
    task_create_req = TaskCreateRequest(
        task_type="test_task",
        thread_id="test_thread",
        name="Test Task",
        instructions="Test instructions",
    )
    response = client.post(
        "/api/tasks/", json=task_create_req.model_dump(), headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["task_type"] == "test_task"
    assert data["thread_id"] == "test_thread"
    assert data["name"] == "Test Task"
    assert data["instructions"] == "Test instructions"
    assert data["user_id"] == user.id


def test_get_task(client: TestClient, user: User, headers: dict[str, str]):
    task = Task.create(
        user_id=user.id,
        thread_id="test_thread",
        task_type="test_task",
        name="Test Task",
        instructions="Test instructions",
    )
    response = client.get(f"/api/tasks/{task.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task.id
    assert data["task_type"] == "test_task"
    assert data["thread_id"] == "test_thread"
    assert data["name"] == "Test Task"
    assert data["instructions"] == "Test instructions"
    assert data["user_id"] == user.id


def test_update_task(client: TestClient, user: User, headers: dict[str, str]):
    task = Task.create(
        user_id=user.id,
        thread_id="test_thread",
        task_type="test_task",
        name="Test Task",
        instructions="Test instructions",
    )
    task_update_req = TaskUpdateRequest(
        status="completed",
        error="Test error",
        result="Test result",
        cost=10.0,
    )
    response = client.put(
        f"/api/tasks/{task.id}", json=task_update_req.model_dump(), headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task.id
    assert data["status"] == "completed"
    assert data["error"] == "Test error"
    assert data["result"] == "Test result"
    assert data["cost"] == 10.0


def test_delete_task(client: TestClient, user: User, headers: dict[str, str]):
    task = Task.create(
        user_id=user.id,
        thread_id="test_thread",
        task_type="test_task",
        name="Test Task",
        instructions="Test instructions",
    )
    response = client.delete(f"/api/tasks/{task.id}", headers=headers)
    assert response.status_code == 200
    assert Task.find(user.id, task.id) is None


def test_index_tasks(client: TestClient, user: User, headers: dict[str, str]):
    Task.create(
        user_id=user.id,
        thread_id="test_thread1",
        task_type="test_task1",
        name="Test Task 1",
        instructions="Test instructions 1",
    )
    Task.create(
        user_id=user.id,
        thread_id="test_thread2",
        task_type="test_task2",
        name="Test Task 2",
        instructions="Test instructions 2",
    )
    response = client.get(
        "/api/tasks/", headers=headers, params={"thread_id": "test_thread1"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["thread_id"] == "test_thread1"

    response = client.get(
        "/api/tasks/", headers=headers, params={"thread_id": "test_thread2"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["thread_id"] == "test_thread2"
